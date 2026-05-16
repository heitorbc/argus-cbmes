import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  EscalaEspecialMensal,
  EscalaMensal,
  NotaServico,
} from '@argus/shared-types';
import { EscalasService } from '../escalas/escalas.service';
import { EscalasEspeciaisService } from '../escalas-especiais/escalas-especiais.service';
import { NotasServicoService } from '../notas-servico/notas-servico.service';
import type { SheetsDbService } from './sheets-db.service';

/**
 * Tests de integração S2.2: confirma que cada um dos 3 services
 * dispara dual-write para o SheetsDbService quando habilitado e
 * silencia quando desabilitado.
 */

function makeSheetsDbMock(enabled: boolean) {
  return {
    isEnabled: () => enabled,
    replaceEscalaMensalMes: vi.fn(async () => {}),
    replaceEscalaEspecialMes: vi.fn(async () => {}),
    upsertNotaServico: vi.fn(async () => {}),
    deleteNotaServico: vi.fn(async () => {}),
    readNotasServico: vi.fn(async () => []),
  } as unknown as SheetsDbService & {
    replaceEscalaMensalMes: ReturnType<typeof vi.fn>;
    replaceEscalaEspecialMes: ReturnType<typeof vi.fn>;
    upsertNotaServico: ReturnType<typeof vi.fn>;
    deleteNotaServico: ReturnType<typeof vi.fn>;
    readNotasServico: ReturnType<typeof vi.fn>;
  };
}

const escalaMensalSample: EscalaMensal = {
  ano: 2026,
  mes: 5,
  origemArquivo: 'maio.xlsx',
  importadoEm: '2026-04-30T00:00:00.000Z',
  diaEquipe: { '2026-05-01': 'A' },
  composicaoPorQuinzena: {
    ultimoDiaQ1: 14,
    q1: [
      {
        equipe: 'A',
        viatura: 'X',
        funcao: 'Mot',
        militar: { raw: 'M', postoAbreviado: 'CB', nomeGuerra: 'M', nf: '111' },
      },
    ],
    q2: [],
  },
  avisos: [],
};

const escalaEspecialSample: EscalaEspecialMensal = {
  ano: 2026,
  mes: 5,
  origemArquivo: 'esp.xlsm',
  importadoEm: '2026-04-30T00:00:00.000Z',
  atos: [
    {
      data: '2026-05-10',
      militarRaw: 'CB X',
      militarNf: '111',
      horario: '07:10 ÀS 13:10',
      funcao: 'APOIO',
    },
  ],
  avisos: [],
};

describe('EscalasService dual-write', () => {
  it('save() dispara replaceEscalaMensalMes quando enabled', async () => {
    const sheetsDb = makeSheetsDbMock(true);
    const svc = new EscalasService(sheetsDb);
    svc.save(escalaMensalSample);
    // fire-and-forget: aguarda 1 tick
    await new Promise((r) => setImmediate(r));
    expect(sheetsDb.replaceEscalaMensalMes).toHaveBeenCalledWith(
      2026,
      5,
      expect.any(Array),
    );
  });

  it('save() é no-op para Sheets-DB quando desabilitado', async () => {
    const sheetsDb = makeSheetsDbMock(false);
    const svc = new EscalasService(sheetsDb);
    svc.save(escalaMensalSample);
    await new Promise((r) => setImmediate(r));
    expect(sheetsDb.replaceEscalaMensalMes).not.toHaveBeenCalled();
  });

  it('delete() dispara replace com array vazio (limpa mês)', async () => {
    const sheetsDb = makeSheetsDbMock(true);
    const svc = new EscalasService(sheetsDb);
    svc.save(escalaMensalSample);
    sheetsDb.replaceEscalaMensalMes.mockClear();
    svc.delete(2026, 5);
    await new Promise((r) => setImmediate(r));
    expect(sheetsDb.replaceEscalaMensalMes).toHaveBeenCalledWith(2026, 5, []);
  });

  it('falha do Sheets-DB não derruba in-memory', async () => {
    const sheetsDb = makeSheetsDbMock(true);
    sheetsDb.replaceEscalaMensalMes.mockRejectedValue(new Error('rate limit'));
    const svc = new EscalasService(sheetsDb);
    svc.save(escalaMensalSample);
    await new Promise((r) => setImmediate(r));
    // In-memory persistiu apesar do erro Sheets
    expect(svc.get(2026, 5)).toEqual(escalaMensalSample);
  });

  it('funciona sem SheetsDbService injetado (constructor opcional)', () => {
    const svc = new EscalasService();
    expect(() => svc.save(escalaMensalSample)).not.toThrow();
    expect(svc.get(2026, 5)).toEqual(escalaMensalSample);
  });
});

describe('EscalasEspeciaisService dual-write', () => {
  it('save() dispara replaceEscalaEspecialMes', async () => {
    const sheetsDb = makeSheetsDbMock(true);
    const svc = new EscalasEspeciaisService(sheetsDb);
    svc.save(escalaEspecialSample);
    await new Promise((r) => setImmediate(r));
    expect(sheetsDb.replaceEscalaEspecialMes).toHaveBeenCalledWith(2026, 5, [
      [
        '2026',
        '5',
        '2026-05-10',
        'CB X',
        '111',
        '07:10 ÀS 13:10',
        'APOIO',
        'esp.xlsm',
        '2026-04-30T00:00:00.000Z',
        '',
      ],
    ]);
  });

  it('delete() limpa o mês no Sheets-DB', async () => {
    const sheetsDb = makeSheetsDbMock(true);
    const svc = new EscalasEspeciaisService(sheetsDb);
    svc.save(escalaEspecialSample);
    sheetsDb.replaceEscalaEspecialMes.mockClear();
    svc.delete(2026, 5);
    await new Promise((r) => setImmediate(r));
    expect(sheetsDb.replaceEscalaEspecialMes).toHaveBeenCalledWith(2026, 5, []);
  });
});

describe('NotasServicoService dual-write + bootstrap', () => {
  let sheetsDb: ReturnType<typeof makeSheetsDbMock>;
  let svc: NotasServicoService;

  beforeEach(() => {
    sheetsDb = makeSheetsDbMock(true);
    svc = new NotasServicoService(sheetsDb);
  });

  it('create() dispara upsertNotaServico', async () => {
    svc.create(
      {
        codigo: 'NS001',
        descricao: 'X',
        data: '2026-05-15',
        horaInicio: '08:00',
        horaFim: '12:00',
        militaresNfs: ['111'],
      },
      '3037509',
    );
    await new Promise((r) => setImmediate(r));
    expect(sheetsDb.upsertNotaServico).toHaveBeenCalledTimes(1);
    const row = sheetsDb.upsertNotaServico.mock.calls[0]?.[0] as string[];
    expect(row[1]).toBe('NS001');
  });

  it('update() dispara upsertNotaServico', async () => {
    const ns = svc.create(
      {
        codigo: 'NS001',
        descricao: 'X',
        data: '2026-05-15',
        horaInicio: '08:00',
        horaFim: '12:00',
        militaresNfs: ['111'],
      },
      '3037509',
    );
    sheetsDb.upsertNotaServico.mockClear();
    svc.update(ns.id, { descricao: 'Y' });
    await new Promise((r) => setImmediate(r));
    expect(sheetsDb.upsertNotaServico).toHaveBeenCalledTimes(1);
  });

  it('remove() dispara deleteNotaServico', async () => {
    const ns = svc.create(
      {
        codigo: 'NS001',
        descricao: 'X',
        data: '2026-05-15',
        horaInicio: '08:00',
        horaFim: '12:00',
        militaresNfs: ['111'],
      },
      '3037509',
    );
    sheetsDb.deleteNotaServico.mockClear();
    svc.remove(ns.id);
    await new Promise((r) => setImmediate(r));
    expect(sheetsDb.deleteNotaServico).toHaveBeenCalledWith(ns.id);
  });

  it('onModuleInit carrega NS do Sheets-DB (bootstrap pós-restart)', async () => {
    const persisted: NotaServico = {
      id: 'ns:persistido',
      codigo: 'NS999',
      descricao: 'Vinda do Sheets',
      data: '2026-05-20',
      horaInicio: '09:00',
      horaFim: '17:00',
      militaresNfs: ['222'],
      criadoEm: '2026-05-19T00:00:00.000Z',
      criadoPorNf: '3037509',
    };
    // Simula linha já existente no Sheets-DB
    sheetsDb.readNotasServico.mockResolvedValue([
      [
        persisted.id,
        persisted.codigo,
        persisted.descricao,
        persisted.data,
        persisted.horaInicio,
        persisted.horaFim,
        '',
        persisted.militaresNfs.join('|'),
        '',
        persisted.criadoEm,
        persisted.criadoPorNf,
      ],
    ]);
    // Limpa NODE_ENV pra deixar o onModuleInit rodar
    const prev = process.env.NODE_ENV;
    delete process.env.NODE_ENV;
    try {
      await svc.onModuleInit();
    } finally {
      if (prev !== undefined) process.env.NODE_ENV = prev;
    }
    expect(svc.findById('ns:persistido').codigo).toBe('NS999');
  });

  it('onModuleInit é no-op em ambiente test (preserva isolamento)', async () => {
    process.env.NODE_ENV = 'test';
    await svc.onModuleInit();
    expect(sheetsDb.readNotasServico).not.toHaveBeenCalled();
  });
});

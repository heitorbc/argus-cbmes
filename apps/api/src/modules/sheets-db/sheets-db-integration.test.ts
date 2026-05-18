import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EscalaEspecialMensal, EscalaMensal, NotaServico } from '@argus/shared-types';
import { EscalasService } from '../escalas/escalas.service';
import { EscalasEspeciaisService } from '../escalas-especiais/escalas-especiais.service';
import { NotasServicoService } from '../notas-servico/notas-servico.service';
import { makeEscalasPrismaMock } from '../../common/prisma/prisma-test-mock';
import type { SheetsDbService } from './sheets-db.service';

/**
 * Tests de integração S2.2 → S2.10.5: confirma que cada um dos 3 services
 * dispara dual-write para o SheetsDbService quando habilitado e silencia
 * quando desabilitado. Prisma é a fonte primária; Sheets-DB é espelho.
 */

function makeSheetsDbMock(enabled: boolean) {
  return {
    isEnabled: () => enabled,
    replaceEscalaMensalMes: vi.fn(async () => {}),
    replaceEscalaEspecialMes: vi.fn(async () => {}),
    upsertNotaServico: vi.fn(async () => {}),
    deleteNotaServico: vi.fn(async () => {}),
    readEscalaMensal: vi.fn(async () => []),
    readEscalaEspecial: vi.fn(async () => []),
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
    const svc = new EscalasService(makeEscalasPrismaMock(), sheetsDb);
    await svc.save(escalaMensalSample);
    await new Promise((r) => setImmediate(r));
    expect(sheetsDb.replaceEscalaMensalMes).toHaveBeenCalledWith(2026, 5, expect.any(Array));
  });

  it('save() é no-op para Sheets-DB quando desabilitado', async () => {
    const sheetsDb = makeSheetsDbMock(false);
    const svc = new EscalasService(makeEscalasPrismaMock(), sheetsDb);
    await svc.save(escalaMensalSample);
    await new Promise((r) => setImmediate(r));
    expect(sheetsDb.replaceEscalaMensalMes).not.toHaveBeenCalled();
  });

  it('delete() dispara replace com array vazio (limpa mês)', async () => {
    const sheetsDb = makeSheetsDbMock(true);
    const svc = new EscalasService(makeEscalasPrismaMock(), sheetsDb);
    await svc.save(escalaMensalSample);
    sheetsDb.replaceEscalaMensalMes.mockClear();
    await svc.delete(2026, 5);
    await new Promise((r) => setImmediate(r));
    expect(sheetsDb.replaceEscalaMensalMes).toHaveBeenCalledWith(2026, 5, []);
  });

  it('falha do Sheets-DB não derruba persistência Postgres', async () => {
    const sheetsDb = makeSheetsDbMock(true);
    sheetsDb.replaceEscalaMensalMes.mockRejectedValue(new Error('rate limit'));
    const svc = new EscalasService(makeEscalasPrismaMock(), sheetsDb);
    await svc.save(escalaMensalSample);
    await new Promise((r) => setImmediate(r));
    // Postgres persistiu apesar do erro Sheets
    const got = await svc.get(2026, 5);
    expect(got?.ano).toBe(2026);
    expect(got?.mes).toBe(5);
  });

  it('funciona sem SheetsDbService injetado (constructor opcional)', async () => {
    const svc = new EscalasService(makeEscalasPrismaMock());
    await expect(svc.save(escalaMensalSample)).resolves.toBeTruthy();
    const got = await svc.get(2026, 5);
    expect(got?.ano).toBe(2026);
  });
});

describe('EscalasEspeciaisService dual-write', () => {
  it('save() dispara replaceEscalaEspecialMes', async () => {
    const sheetsDb = makeSheetsDbMock(true);
    const svc = new EscalasEspeciaisService(makeEscalasPrismaMock(), sheetsDb);
    await svc.save(escalaEspecialSample);
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
    const svc = new EscalasEspeciaisService(makeEscalasPrismaMock(), sheetsDb);
    await svc.save(escalaEspecialSample);
    sheetsDb.replaceEscalaEspecialMes.mockClear();
    await svc.delete(2026, 5);
    await new Promise((r) => setImmediate(r));
    expect(sheetsDb.replaceEscalaEspecialMes).toHaveBeenCalledWith(2026, 5, []);
  });
});

describe('NotasServicoService dual-write + bootstrap', () => {
  let sheetsDb: ReturnType<typeof makeSheetsDbMock>;
  let svc: NotasServicoService;

  beforeEach(() => {
    sheetsDb = makeSheetsDbMock(true);
    svc = new NotasServicoService(makeEscalasPrismaMock(), sheetsDb);
  });

  it('create() dispara upsertNotaServico', async () => {
    await svc.create(
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
    const ns = await svc.create(
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
    await svc.update(ns.id, { descricao: 'Y' });
    await new Promise((r) => setImmediate(r));
    expect(sheetsDb.upsertNotaServico).toHaveBeenCalledTimes(1);
  });

  it('remove() dispara deleteNotaServico', async () => {
    const ns = await svc.create(
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
    await svc.remove(ns.id);
    await new Promise((r) => setImmediate(r));
    expect(sheetsDb.deleteNotaServico).toHaveBeenCalledWith(ns.id);
  });

  it('bootstrap importa Sheets-DB → Postgres quando Postgres vazio', async () => {
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
    // NODE_ENV=test pula o onModuleInit; emulamos chamando direto.
    // Como o método é privado, recriamos o service com NODE_ENV destemporariamente.
    const oldEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    const svc2 = new NotasServicoService(makeEscalasPrismaMock(), sheetsDb);
    await svc2.onModuleInit();
    process.env.NODE_ENV = oldEnv;
    const lista = await svc2.list();
    expect(lista.some((n) => n.codigo === 'NS999')).toBe(true);
  });
});

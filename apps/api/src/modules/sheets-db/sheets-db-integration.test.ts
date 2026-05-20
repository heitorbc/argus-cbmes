import { describe, it, expect, vi } from 'vitest';
import type { EscalaEspecialMensal, EscalaMensal } from '@argus/shared-types';
import { EscalasService } from '../escalas/escalas.service';
import { EscalasEspeciaisService } from '../escalas-especiais/escalas-especiais.service';
import { NotasServicoService } from '../notas-servico/notas-servico.service';
import { makeEscalasPrismaMock } from '../../common/prisma/prisma-test-mock';
import type { SheetsDbService } from './sheets-db.service';

/**
 * S2.10.9d — Tests de regressão do encerramento do dual-write.
 *
 * Antes (S2.2 → S2.10.8): `save()` / `delete()` / `remove()` em
 * EscalasService, EscalasEspeciaisService e NotasServicoService disparavam
 * write fire-and-forget para a planilha BD_ARGUS_CBMES_HOM.
 *
 * Agora (S2.10.9d): Postgres é canônico (desde S2.10.5). Os helpers
 * `syncToSheetsDb` / `deleteFromSheetsDb` foram removidos. Os métodos
 * de leitura `bootstrapFromSheetsDbIfEmpty()` permanecem como fallback
 * read-only de segurança (bootstrap no startup quando tabela vazia).
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

describe('S2.10.9d — EscalasService: dual-write removido', () => {
  it('save() NÃO chama mais replaceEscalaMensalMes', async () => {
    const sheetsDb = makeSheetsDbMock(true);
    const svc = new EscalasService(makeEscalasPrismaMock(), sheetsDb);
    await svc.save(escalaMensalSample);
    await new Promise((r) => setImmediate(r));
    expect(sheetsDb.replaceEscalaMensalMes).not.toHaveBeenCalled();
  });

  it('delete() NÃO chama mais replaceEscalaMensalMes', async () => {
    const sheetsDb = makeSheetsDbMock(true);
    const svc = new EscalasService(makeEscalasPrismaMock(), sheetsDb);
    await svc.save(escalaMensalSample);
    await svc.delete(2026, 5);
    await new Promise((r) => setImmediate(r));
    expect(sheetsDb.replaceEscalaMensalMes).not.toHaveBeenCalled();
  });
});

describe('S2.10.9d — EscalasEspeciaisService: dual-write removido', () => {
  it('save() NÃO chama mais replaceEscalaEspecialMes', async () => {
    const sheetsDb = makeSheetsDbMock(true);
    const svc = new EscalasEspeciaisService(makeEscalasPrismaMock(), sheetsDb);
    await svc.save(escalaEspecialSample);
    await new Promise((r) => setImmediate(r));
    expect(sheetsDb.replaceEscalaEspecialMes).not.toHaveBeenCalled();
  });

  it('delete() NÃO chama mais replaceEscalaEspecialMes', async () => {
    const sheetsDb = makeSheetsDbMock(true);
    const svc = new EscalasEspeciaisService(makeEscalasPrismaMock(), sheetsDb);
    await svc.save(escalaEspecialSample);
    await svc.delete(2026, 5);
    await new Promise((r) => setImmediate(r));
    expect(sheetsDb.replaceEscalaEspecialMes).not.toHaveBeenCalled();
  });
});

describe('S2.10.9d — NotasServicoService: dual-write removido', () => {
  it('create() NÃO chama mais upsertNotaServico', async () => {
    const sheetsDb = makeSheetsDbMock(true);
    const svc = new NotasServicoService(makeEscalasPrismaMock(), sheetsDb);
    await svc.create(
      {
        codigo: 'NS-T1',
        descricao: 'teste',
        data: '2026-05-10',
        horaInicio: '08:00',
        horaFim: '18:00',
        militaresNfs: ['111'],
      },
      '3037509',
    );
    await new Promise((r) => setImmediate(r));
    expect(sheetsDb.upsertNotaServico).not.toHaveBeenCalled();
  });

  it('remove() NÃO chama mais deleteNotaServico', async () => {
    const sheetsDb = makeSheetsDbMock(true);
    const svc = new NotasServicoService(makeEscalasPrismaMock(), sheetsDb);
    const ns = await svc.create(
      {
        codigo: 'NS-T2',
        descricao: 'a remover',
        data: '2026-05-11',
        horaInicio: '09:00',
        horaFim: '17:00',
        militaresNfs: ['111'],
      },
      '3037509',
    );
    await svc.remove(ns.id);
    await new Promise((r) => setImmediate(r));
    expect(sheetsDb.deleteNotaServico).not.toHaveBeenCalled();
  });

  it('bootstrap read-only continua funcionando (fallback de segurança)', async () => {
    const sheetsDb = makeSheetsDbMock(true);
    const persisted = {
      id: 'ns:t-3',
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
    const oldEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    const svc = new NotasServicoService(makeEscalasPrismaMock(), sheetsDb);
    await svc.onModuleInit();
    process.env.NODE_ENV = oldEnv;
    const lista = await svc.list();
    expect(lista.some((n) => n.codigo === 'NS999')).toBe(true);
  });
});

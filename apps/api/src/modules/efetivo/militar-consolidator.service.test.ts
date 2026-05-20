import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Militar as MilitarPrisma } from '@prisma/client';
import type { Militar } from '@argus/shared-types';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { ChefesOperacoesService } from '../chefes-operacoes/chefes-operacoes.service';
import type { EfetivoService } from './efetivo.service';
import { MilitarConsolidatorService } from './militar-consolidator.service';
import type { MilitarDados } from './qdi-dados-csv-parser';
import type { QdiDadosService } from './qdi-dados.service';
import type { MilitarQdi } from './qdi-csv-parser';
import type { QdiService } from './qdi.service';

function makePrismaMock(): PrismaService & { _rows: Map<string, MilitarPrisma> } {
  const rows = new Map<string, MilitarPrisma>();
  return {
    _rows: rows,
    militar: {
      count: async () => rows.size,
      findUnique: async ({ where }: { where: { nf: string } }) => rows.get(where.nf) ?? null,
      findMany: async () => Array.from(rows.values()),
      create: async ({ data }: { data: MilitarPrisma }) => {
        rows.set(data.nf, { ...data });
        return data;
      },
      update: async ({ where, data }: { where: { nf: string }; data: Partial<MilitarPrisma> }) => {
        const existing = rows.get(where.nf);
        if (!existing) throw new Error('not found');
        const updated = { ...existing, ...data };
        rows.set(where.nf, updated);
        return updated;
      },
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { nf: string };
        create: MilitarPrisma;
        update: Partial<MilitarPrisma>;
      }) => {
        const existing = rows.get(where.nf);
        if (existing) {
          const updated = { ...existing, ...update };
          rows.set(where.nf, updated);
          return updated;
        }
        rows.set(where.nf, { ...create });
        return create;
      },
    },
  } as unknown as PrismaService & { _rows: Map<string, MilitarPrisma> };
}

function dados(nf: string, ant: number, posto: string, nome: string): MilitarDados {
  return {
    nf,
    ant,
    posto,
    nome,
    nomeGuerra: nome.split(' ')[0],
  } as MilitarDados;
}

function qdiEntry(nf: string, ant: number, postoAtual: string, nomeGuerra: string): MilitarQdi {
  return {
    nf,
    ant,
    postoAtual,
    nomeGuerra,
    subSecao: 'sos',
  } as MilitarQdi;
}

function makeServices(opts: {
  efetivoByNf?: Map<string, Militar>;
  qdiByNf?: Map<string, MilitarQdi>;
  dadosByNf?: Map<string, MilitarDados>;
  chops?: Set<string>;
  chopsExtras?: Map<string, MilitarDados>;
  efetivoFails?: boolean;
  qdiFails?: boolean;
  dadosFails?: boolean;
}) {
  const efetivo = {
    getRawEfetivoByNf: opts.efetivoFails
      ? vi.fn().mockRejectedValue(new Error('EFETIVO down'))
      : vi.fn().mockResolvedValue({
          byNf: opts.efetivoByNf ?? new Map(),
          syncedAt: Date.now(),
          stale: false,
        }),
  } as unknown as EfetivoService;
  const qdi = {
    getByNf: opts.qdiFails
      ? vi.fn().mockRejectedValue(new Error('QDI down'))
      : vi.fn().mockResolvedValue({
          byNf: opts.qdiByNf ?? new Map(),
          syncedAt: Date.now(),
          stale: false,
        }),
  } as unknown as QdiService;
  const qdiDados = {
    getByNf: opts.dadosFails
      ? vi.fn().mockRejectedValue(new Error('DADOS down'))
      : vi.fn().mockResolvedValue({
          byNf: opts.dadosByNf ?? new Map(),
          syncedAt: Date.now(),
          stale: false,
        }),
    findUnfilteredByNfs: vi.fn().mockResolvedValue(opts.chopsExtras ?? new Map()),
  } as unknown as QdiDadosService;
  const chops = {
    getHabilitadosNfs: vi.fn().mockResolvedValue(opts.chops ?? new Set()),
  } as unknown as ChefesOperacoesService;
  return { efetivo, qdi, qdiDados, chops };
}

describe('MilitarConsolidatorService (S2.10.8d)', () => {
  let prisma: ReturnType<typeof makePrismaMock>;

  beforeEach(() => {
    prisma = makePrismaMock();
  });

  it('upserta militares consolidados em prisma.militar', async () => {
    const dadosByNf = new Map<string, MilitarDados>([
      ['3037509', dados('3037509', 419, '2ºSGT', 'HEITOR BARCELLOS')],
    ]);
    const qdiByNf = new Map<string, MilitarQdi>([
      ['3037509', qdiEntry('3037509', 419, '2ºSGT', 'BARCELLOS')],
    ]);
    const svc = new MilitarConsolidatorService(
      prisma,
      ...(Object.values(makeServices({ dadosByNf, qdiByNf })) as [
        EfetivoService,
        QdiService,
        QdiDadosService,
        ChefesOperacoesService,
      ]),
    );
    const r = await svc.consolidateAndUpsert();
    expect(r.created).toBe(1);
    expect(r.updated).toBe(0);
    expect(prisma._rows.size).toBe(1);
    const row = prisma._rows.get('3037509');
    expect(row?.posto).toBe('2ºSGT');
    expect(row?.subSecao).toBe('sos'); // QDI contribuiu
  });

  it('é idempotente: 2 runs com mesmas fontes → 2ª run só updated', async () => {
    const dadosByNf = new Map([['3037509', dados('3037509', 419, '2ºSGT', 'BARCELLOS')]]);
    const services = makeServices({ dadosByNf });
    const svc = new MilitarConsolidatorService(
      prisma,
      services.efetivo,
      services.qdi,
      services.qdiDados,
      services.chops,
    );
    await svc.consolidateAndUpsert();
    const r2 = await svc.consolidateAndUpsert();
    expect(r2.created).toBe(0);
    expect(r2.updated).toBe(1);
  });

  it('inflight lock: 2 chamadas paralelas compartilham a mesma consolidação', async () => {
    const dadosByNf = new Map([['3037509', dados('3037509', 419, '2ºSGT', 'BARCELLOS')]]);
    const services = makeServices({ dadosByNf });
    const svc = new MilitarConsolidatorService(
      prisma,
      services.efetivo,
      services.qdi,
      services.qdiDados,
      services.chops,
    );
    const [a, b] = await Promise.all([svc.consolidateAndUpsert(), svc.consolidateAndUpsert()]);
    // Mesma promise resolvida → mesmos counts em ambos
    expect(a.created).toBe(b.created);
    expect(a.updated).toBe(b.updated);
    // efetivo.getRawEfetivoByNf chamada apenas 1 vez (lock compartilhado)
    expect(services.efetivo.getRawEfetivoByNf).toHaveBeenCalledTimes(1);
  });

  it('falha em 1 source (QDI) NÃO interrompe consolidação', async () => {
    const dadosByNf = new Map([['3037509', dados('3037509', 419, '2ºSGT', 'BARCELLOS')]]);
    const services = makeServices({ dadosByNf, qdiFails: true });
    const svc = new MilitarConsolidatorService(
      prisma,
      services.efetivo,
      services.qdi,
      services.qdiDados,
      services.chops,
    );
    const r = await svc.consolidateAndUpsert();
    expect(r.created).toBe(1); // DADOS sozinho basta
    expect(r.inconsistencias.some((m) => m.includes('QDI'))).toBe(true);
  });

  it('ChOps habilitados ganham papelEspecial', async () => {
    const dadosByNf = new Map([['3037509', dados('3037509', 419, '2ºSGT', 'BARCELLOS')]]);
    const chops = new Set(['3037509']);
    const services = makeServices({ dadosByNf, chops });
    const svc = new MilitarConsolidatorService(
      prisma,
      services.efetivo,
      services.qdi,
      services.qdiDados,
      services.chops,
    );
    await svc.consolidateAndUpsert();
    const row = prisma._rows.get('3037509');
    expect(row?.papelEspecial).toBe('Chefe de Operações');
  });

  it('ChOps de outras Cias entram no consolidado via findUnfilteredByNfs', async () => {
    const dadosByNf = new Map([['3037509', dados('3037509', 419, '2ºSGT', 'BARCELLOS')]]);
    const chops = new Set(['9999999']); // NF fora da 1ª Cia
    const chopsExtras = new Map([['9999999', dados('9999999', 1, 'CAP', 'EXTRA')]]);
    const services = makeServices({ dadosByNf, chops, chopsExtras });
    const svc = new MilitarConsolidatorService(
      prisma,
      services.efetivo,
      services.qdi,
      services.qdiDados,
      services.chops,
    );
    await svc.consolidateAndUpsert();
    expect(prisma._rows.has('3037509')).toBe(true);
    expect(prisma._rows.has('9999999')).toBe(true);
    expect(prisma._rows.get('9999999')?.papelEspecial).toBe('Chefe de Operações');
  });

  it('todas as 3 fontes falharem → consolidação não cria nada + registra 3 inconsistências', async () => {
    const services = makeServices({ efetivoFails: true, qdiFails: true, dadosFails: true });
    const svc = new MilitarConsolidatorService(
      prisma,
      services.efetivo,
      services.qdi,
      services.qdiDados,
      services.chops,
    );
    const r = await svc.consolidateAndUpsert();
    expect(r.created).toBe(0);
    expect(r.inconsistencias.length).toBe(3);
  });
});

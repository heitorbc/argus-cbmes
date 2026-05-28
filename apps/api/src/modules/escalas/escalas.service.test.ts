import { describe, it, expect, beforeEach } from 'vitest';
import type { ComposicaoEntry, EscalaMensal } from '@argus/shared-types';
import type { ComposicaoEntry as PrismaCE, EscalaMensal as PrismaEM } from '@prisma/client';
import { EscalasService, computeDiff, quinzenaDoDia } from './escalas.service';
import type { PrismaService } from '../../common/prisma/prisma.service';

const composicaoBase: ComposicaoEntry[] = [
  {
    equipe: 'C',
    viatura: 'ABTS 01',
    funcao: 'Ch',
    militar: { raw: '2º SGT BARCELLOS', postoAbreviado: '2ºSGT', nomeGuerra: 'BARCELLOS' },
  },
  {
    equipe: 'C',
    viatura: 'ABTS 01',
    funcao: 'Op 1',
    militar: { raw: 'SD MARTINELLI', postoAbreviado: 'SD', nomeGuerra: 'MARTINELLI' },
  },
  {
    equipe: 'A',
    viatura: 'ABTS 01',
    funcao: 'Ch',
    militar: { raw: '3º SGT LOUZADA', postoAbreviado: '3ºSGT', nomeGuerra: 'LOUZADA' },
  },
];

function fakeEscala(overrides: Partial<EscalaMensal> = {}): EscalaMensal {
  return {
    mes: 5,
    ano: 2026,
    origemArquivo: 'fake.xlsx',
    importadoEm: '2026-05-08T00:00:00.000Z',
    importadoPorNf: '3037509',
    diaEquipe: {
      '2026-05-01': 'C',
      '2026-05-02': 'D',
      '2026-05-03': 'A',
      '2026-05-20': 'C',
    },
    composicaoPorQuinzena: {
      q1: composicaoBase,
      q2: composicaoBase,
      ultimoDiaQ1: 14,
    },
    avisos: [],
    ...overrides,
  };
}

/**
 * Mock in-memory de `prisma.escalaMensal.*` e `prisma.composicaoEntry.*`
 * com suporte a $transaction (callback recebe o próprio mock).
 */
function makePrismaMock(): PrismaService {
  const mesesById = new Map<string, PrismaEM>();
  const entriesByMesId = new Map<string, PrismaCE[]>();
  let counter = 1;
  let entryCounter = 1;

  const escalaMensal = {
    count: async () => mesesById.size,
    findUnique: async ({
      where,
      include,
      select: _select,
    }: {
      where: { ano_mes: { ano: number; mes: number } };
      include?: { composicaoEntries?: boolean };
      select?: unknown;
    }) => {
      for (const m of mesesById.values()) {
        if (m.ano === where.ano_mes.ano && m.mes === where.ano_mes.mes) {
          return include?.composicaoEntries
            ? ({ ...m, composicaoEntries: entriesByMesId.get(m.id) ?? [] } as PrismaEM & {
                composicaoEntries: PrismaCE[];
              })
            : m;
        }
      }
      return null;
    },
    findMany: async ({
      orderBy: _orderBy,
      select: _select,
      include,
      where: _where,
    }: {
      orderBy?: unknown;
      select?: unknown;
      include?: { composicaoEntries?: boolean };
      where?: unknown;
    } = {}) => {
      const arr = [...mesesById.values()].sort((a, b) => b.ano - a.ano || b.mes - a.mes);
      // S2.10.14 — suporta include.composicaoEntries (usado por
      // `listEscaladosDoMilitarNoRange`).
      if (include?.composicaoEntries) {
        return arr.map((m) => ({ ...m, composicaoEntries: entriesByMesId.get(m.id) ?? [] }));
      }
      return arr;
    },
    create: async ({
      data,
    }: {
      data: {
        ano: number;
        mes: number;
        origemArquivo: string;
        importadoEm: Date;
        importadoPorNf?: string | null;
        diaEquipe: unknown;
        avisos?: unknown;
        mergulho?: unknown;
        salvamar?: unknown;
        ultimoDiaQ1: number;
        composicaoEntries?: { create: Array<Omit<PrismaCE, 'id' | 'escalaMensalId'>> };
      };
    }) => {
      const id = `em-${counter++}`;
      const m: PrismaEM = {
        id,
        ano: data.ano,
        mes: data.mes,
        origemArquivo: data.origemArquivo,
        importadoEm: data.importadoEm,
        importadoPorNf: data.importadoPorNf ?? null,
        diaEquipe: data.diaEquipe as PrismaEM['diaEquipe'],
        avisos: (data.avisos ?? null) as PrismaEM['avisos'],
        mergulho: (data.mergulho ?? null) as PrismaEM['mergulho'],
        salvamar: (data.salvamar ?? null) as PrismaEM['salvamar'],
        ultimoDiaQ1: data.ultimoDiaQ1,
      };
      mesesById.set(id, m);
      const entries: PrismaCE[] = (data.composicaoEntries?.create ?? []).map((c) => ({
        ...c,
        id: `ce-${entryCounter++}`,
        escalaMensalId: id,
      }));
      entriesByMesId.set(id, entries);
      return m;
    },
    update: async ({
      where,
      data,
    }: {
      where: { id?: string; ano_mes?: { ano: number; mes: number } };
      data: Partial<PrismaEM> & {
        composicaoEntries?: { create: Array<Omit<PrismaCE, 'id' | 'escalaMensalId'>> };
      };
    }) => {
      let id: string | undefined = where.id;
      if (!id && where.ano_mes) {
        for (const [k, m] of mesesById.entries()) {
          if (m.ano === where.ano_mes.ano && m.mes === where.ano_mes.mes) {
            id = k;
            break;
          }
        }
      }
      if (!id) throw new Error('Not found');
      const m = mesesById.get(id);
      if (!m) throw new Error(`No em ${id}`);
      const next: PrismaEM = { ...m, ...data } as PrismaEM;
      mesesById.set(id, next);
      if (data.composicaoEntries?.create) {
        const entries: PrismaCE[] = data.composicaoEntries.create.map((c) => ({
          ...c,
          id: `ce-${entryCounter++}`,
          escalaMensalId: id!,
        }));
        entriesByMesId.set(id, entries);
      }
      return next;
    },
    delete: async ({ where }: { where: { ano_mes: { ano: number; mes: number } } }) => {
      for (const [id, m] of mesesById.entries()) {
        if (m.ano === where.ano_mes.ano && m.mes === where.ano_mes.mes) {
          mesesById.delete(id);
          entriesByMesId.delete(id);
          return m;
        }
      }
      throw new Error('Not found');
    },
  };

  const composicaoEntry = {
    deleteMany: async ({
      where,
    }: {
      where: {
        escalaMensalId: string;
        quinzena?: number;
        equipe?: string;
        viatura?: string;
        funcao?: string;
      };
    }) => {
      const cur = entriesByMesId.get(where.escalaMensalId) ?? [];
      const next = cur.filter(
        (e) =>
          (where.quinzena !== undefined && e.quinzena !== where.quinzena) ||
          (where.equipe !== undefined && e.equipe !== where.equipe) ||
          (where.viatura !== undefined && e.viatura !== where.viatura) ||
          (where.funcao !== undefined && e.funcao !== where.funcao),
      );
      if (
        where.quinzena === undefined &&
        where.equipe === undefined &&
        where.viatura === undefined &&
        where.funcao === undefined
      ) {
        entriesByMesId.set(where.escalaMensalId, []);
        return { count: cur.length };
      }
      entriesByMesId.set(where.escalaMensalId, next);
      return { count: cur.length - next.length };
    },
    create: async ({ data }: { data: Omit<PrismaCE, 'id'> }) => {
      const cur = entriesByMesId.get(data.escalaMensalId) ?? [];
      const entry: PrismaCE = { ...data, id: `ce-${entryCounter++}` };
      cur.push(entry);
      entriesByMesId.set(data.escalaMensalId, cur);
      return entry;
    },
  };

  const prismaLike = {
    escalaMensal,
    composicaoEntry,
    $transaction: async (cb: (tx: unknown) => Promise<unknown>) => cb(prismaLike),
  };
  return prismaLike as unknown as PrismaService;
}

function makeSvc(): EscalasService {
  return new EscalasService(makePrismaMock());
}

describe('EscalasService', () => {
  let service: EscalasService;

  beforeEach(() => {
    service = makeSvc();
  });

  it('save + get pelo mês', async () => {
    const escala = fakeEscala();
    await service.save(escala);
    const got = await service.get(2026, 5);
    expect(got?.ano).toBe(2026);
    expect(got?.mes).toBe(5);
    expect(got?.composicaoPorQuinzena.q1).toHaveLength(3);
    expect(got?.diaEquipe['2026-05-01']).toBe('C');
    expect(await service.get(2026, 4)).toBeNull();
  });

  it('list ordena por ano/mês decrescente', async () => {
    await service.save(fakeEscala({ mes: 5, ano: 2026 }));
    await service.save(fakeEscala({ mes: 4, ano: 2026 }));
    await service.save(fakeEscala({ mes: 6, ano: 2026 }));
    const list = (await service.list()).escalas;
    expect(list.map((e) => e.mes)).toEqual([6, 5, 4]);
  });

  it('save sobrescreve escala existente do mesmo mês', async () => {
    await service.save(fakeEscala({ origemArquivo: 'v1.xlsx' }));
    await service.save(fakeEscala({ origemArquivo: 'v2.xlsx' }));
    expect((await service.get(2026, 5))?.origemArquivo).toBe('v2.xlsx');
  });

  it('delete remove escala', async () => {
    await service.save(fakeEscala());
    expect(await service.delete(2026, 5)).toBe(true);
    expect(await service.get(2026, 5)).toBeNull();
  });

  it('getEscaladosDoDia retorna equipe escalada e composição', async () => {
    await service.save(fakeEscala());
    const r = await service.getEscaladosDoDia(2026, 5, '2026-05-01');
    expect(r.equipe).toBe('C');
    expect(r.entries).toHaveLength(2);
    expect(r.entries.every((e) => e.equipe === 'C')).toBe(true);
  });

  it('getEscaladosDoDia retorna vazio quando dia não tem equipe', async () => {
    await service.save(fakeEscala());
    const r = await service.getEscaladosDoDia(2026, 5, '2026-05-10');
    expect(r.equipe).toBeNull();
    expect(r.entries).toEqual([]);
  });

  it('getEscaladosDoDia usa composição da 2ª quinzena para dias após ultimoDiaQ1', async () => {
    const composicaoQ2: ComposicaoEntry[] = [
      {
        equipe: 'C',
        viatura: 'ABTS 01',
        funcao: 'Ch',
        militar: { raw: 'CB SUBSTITUTO', postoAbreviado: 'CB', nomeGuerra: 'SUBSTITUTO' },
      },
    ];
    await service.save(
      fakeEscala({
        composicaoPorQuinzena: {
          q1: composicaoBase,
          q2: composicaoQ2,
          ultimoDiaQ1: 14,
        },
      }),
    );
    const dia20 = await service.getEscaladosDoDia(2026, 5, '2026-05-20');
    expect(dia20.entries).toHaveLength(1);
    expect(dia20.entries[0]?.militar.nomeGuerra).toBe('SUBSTITUTO');
    const dia01 = await service.getEscaladosDoDia(2026, 5, '2026-05-01');
    expect(dia01.entries.find((e) => e.funcao === 'Ch')?.militar.nomeGuerra).toBe('BARCELLOS');
  });
});

describe('EscalasService.listEscaladosDoMilitarNoRange (S2.10.14)', () => {
  let service: EscalasService;

  beforeEach(() => {
    service = makeSvc();
  });

  /**
   * S2.10.14 — Fix do bug "escalas mensais sumindo": ComposicaoEntry no
   * Postgres tem `militarNf=null` (parser XLSX nunca preenche). O filtro
   * antigo `c.militar.nf !== nf` descartava todas as entries. Fix:
   * passar efetivo, instancia NomeMatcher para resolver via militarRaw.
   */
  it('com efetivo: resolve militarNf=null via NomeMatcher e retorna dias escalados', async () => {
    // Escala com BARCELLOS NF=undefined na composição (parser XLSX padrão).
    await service.save({
      ano: 2026,
      mes: 5,
      origemArquivo: 'fake.xlsx',
      importadoEm: new Date().toISOString(),
      diaEquipe: { '2026-05-29': 'C' },
      composicaoPorQuinzena: {
        q1: [],
        q2: [
          // 29/05 > ultimoDiaQ1=14 → quinzena 2
          {
            equipe: 'C',
            viatura: 'ABTS 01',
            funcao: 'Ch',
            militar: {
              raw: '2º SGT BARCELLOS',
              postoAbreviado: '2ºSGT',
              nomeGuerra: 'BARCELLOS',
              // Note: nf undefined! (caso real do parser XLSX)
            },
          },
        ],
        ultimoDiaQ1: 14,
      },
      avisos: [],
    });

    // Efetivo consolidado: BARCELLOS NF 3037509 está no efetivo.
    const efetivo = [
      {
        nf: '3037509',
        nome: 'HEITOR BARCELLOS COELHO',
        nomeGuerra: 'BARCELLOS',
        posto: '2ºSGT',
        ant: 419,
      } as never,
    ];

    const r = await service.listEscaladosDoMilitarNoRange(
      '3037509',
      '2026-05-29',
      '2026-05-29',
      efetivo,
    );

    // Esperado: 29/05 (Charlie escalada com BARCELLOS resolvido via matcher)
    expect(r).toHaveLength(1);
    expect(r[0]?.data).toBe('2026-05-29');
    expect(r[0]?.equipe).toBe('C');
    expect(r[0]?.viatura).toBe('ABTS 01');
  });

  it('sem efetivo: comportamento legado — NF=null descartado (back-compat)', async () => {
    await service.save({
      ano: 2026,
      mes: 5,
      origemArquivo: 'fake.xlsx',
      importadoEm: new Date().toISOString(),
      diaEquipe: { '2026-05-29': 'C' },
      composicaoPorQuinzena: {
        q1: [
          {
            equipe: 'C',
            viatura: 'ABTS 01',
            funcao: 'Ch',
            militar: {
              raw: '2º SGT BARCELLOS',
              postoAbreviado: '2ºSGT',
              nomeGuerra: 'BARCELLOS',
            },
          },
        ],
        q2: [],
        ultimoDiaQ1: 14,
      },
      avisos: [],
    });

    // Sem efetivo, NF=undefined → entry descartada.
    const r = await service.listEscaladosDoMilitarNoRange('3037509', '2026-05-29', '2026-05-29');
    expect(r).toEqual([]);
  });

  it('com efetivo + NF salvo no entry: usa direto (NomeMatcher não é necessário)', async () => {
    await service.save({
      ano: 2026,
      mes: 5,
      origemArquivo: 'fake.xlsx',
      importadoEm: new Date().toISOString(),
      diaEquipe: { '2026-05-29': 'C' },
      composicaoPorQuinzena: {
        q1: [],
        q2: [
          {
            equipe: 'C',
            viatura: 'ABTS 01',
            funcao: 'Ch',
            militar: {
              raw: '2º SGT BARCELLOS',
              postoAbreviado: '2ºSGT',
              nomeGuerra: 'BARCELLOS',
              nf: '3037509', // NF salvo (caso ideal pós-enrichment futuro)
            },
          },
        ],
        ultimoDiaQ1: 14,
      },
      avisos: [],
    });

    // Efetivo vazio mesmo — não importa, NF já está no entry.
    const r = await service.listEscaladosDoMilitarNoRange(
      '3037509',
      '2026-05-29',
      '2026-05-29',
      [],
    );
    expect(r).toHaveLength(1);
    expect(r[0]?.data).toBe('2026-05-29');
  });
});

describe('quinzenaDoDia', () => {
  it('resolve pelo ultimoDiaQ1 gravado na escala', () => {
    const escalaMaio = fakeEscala({
      composicaoPorQuinzena: {
        q1: composicaoBase,
        q2: composicaoBase,
        ultimoDiaQ1: 14,
      },
    });
    expect(quinzenaDoDia('2026-05-01', escalaMaio)).toBe(1);
    expect(quinzenaDoDia('2026-05-14', escalaMaio)).toBe(1);
    expect(quinzenaDoDia('2026-05-15', escalaMaio)).toBe(2);
    expect(quinzenaDoDia('2026-05-31', escalaMaio)).toBe(2);
  });

  it('corte em 13 para meses cuja aba 1 termina em 13 (ex.: junho/2026)', () => {
    const escalaJunho = fakeEscala({
      ano: 2026,
      mes: 6,
      composicaoPorQuinzena: {
        q1: composicaoBase,
        q2: composicaoBase,
        ultimoDiaQ1: 13,
      },
    });
    expect(quinzenaDoDia('2026-06-13', escalaJunho)).toBe(1);
    expect(quinzenaDoDia('2026-06-14', escalaJunho)).toBe(2);
    expect(quinzenaDoDia('2026-06-30', escalaJunho)).toBe(2);
  });
});

describe('computeDiff', () => {
  it('detecta dia que mudou de equipe', () => {
    const antes = fakeEscala();
    const depois = fakeEscala({
      diaEquipe: { ...antes.diaEquipe, '2026-05-02': 'B' },
    });
    const diff = computeDiff(antes, depois);
    expect(diff.diasAlterados).toEqual([
      { data: '2026-05-02', equipeAntes: 'D', equipeDepois: 'B' },
    ]);
  });

  it('detecta militar trocado em uma posição (q1)', () => {
    const antes = fakeEscala();
    const depois = fakeEscala({
      composicaoPorQuinzena: {
        q1: antes.composicaoPorQuinzena.q1.map((c) =>
          c.equipe === 'C' && c.funcao === 'Ch'
            ? { ...c, militar: { raw: 'CB FABRE', postoAbreviado: 'CB', nomeGuerra: 'FABRE' } }
            : c,
        ),
        q2: antes.composicaoPorQuinzena.q2,
        ultimoDiaQ1: antes.composicaoPorQuinzena.ultimoDiaQ1,
      },
    });
    const diff = computeDiff(antes, depois);
    expect(diff.composicaoAlteradaPorQuinzena.q1).toHaveLength(1);
    expect(diff.composicaoAlteradaPorQuinzena.q1[0]).toMatchObject({
      equipe: 'C',
      viatura: 'ABTS 01',
      funcao: 'Ch',
      antes: '2º SGT BARCELLOS',
      depois: 'CB FABRE',
    });
    expect(diff.composicaoAlteradaPorQuinzena.q2).toEqual([]);
  });

  it('detecta militar trocado isoladamente na 2ª quinzena', () => {
    const antes = fakeEscala();
    const depois = fakeEscala({
      composicaoPorQuinzena: {
        q1: antes.composicaoPorQuinzena.q1,
        q2: antes.composicaoPorQuinzena.q2.map((c) =>
          c.equipe === 'C' && c.funcao === 'Ch'
            ? { ...c, militar: { raw: 'CB FABRE', postoAbreviado: 'CB', nomeGuerra: 'FABRE' } }
            : c,
        ),
        ultimoDiaQ1: antes.composicaoPorQuinzena.ultimoDiaQ1,
      },
    });
    const diff = computeDiff(antes, depois);
    expect(diff.composicaoAlteradaPorQuinzena.q1).toEqual([]);
    expect(diff.composicaoAlteradaPorQuinzena.q2).toHaveLength(1);
  });

  it('retorna diff vazio quando escalas idênticas', () => {
    const escala = fakeEscala();
    const diff = computeDiff(escala, fakeEscala());
    expect(diff.diasAlterados).toEqual([]);
    expect(diff.composicaoAlteradaPorQuinzena.q1).toEqual([]);
    expect(diff.composicaoAlteradaPorQuinzena.q2).toEqual([]);
  });

  it('detecta posição removida (militar saiu)', () => {
    const antes = fakeEscala();
    const depois = fakeEscala({
      composicaoPorQuinzena: {
        q1: antes.composicaoPorQuinzena.q1.filter(
          (c) => !(c.equipe === 'C' && c.funcao === 'Op 1'),
        ),
        q2: antes.composicaoPorQuinzena.q2,
        ultimoDiaQ1: antes.composicaoPorQuinzena.ultimoDiaQ1,
      },
    });
    const diff = computeDiff(antes, depois);
    expect(diff.composicaoAlteradaPorQuinzena.q1).toEqual([
      {
        equipe: 'C',
        viatura: 'ABTS 01',
        funcao: 'Op 1',
        antes: 'SD MARTINELLI',
        depois: null,
      },
    ]);
  });
});

describe('EscalasService.updateDiaEquipe (F4)', () => {
  let service: EscalasService;
  beforeEach(async () => {
    service = makeSvc();
    await service.save(fakeEscala());
  });

  it('atualiza equipe escalada de um dia', async () => {
    const r = await service.updateDiaEquipe(2026, 5, '2026-05-01', 'D');
    expect(r.diaEquipe['2026-05-01']).toBe('D');
  });

  it('remove dia quando equipe=null', async () => {
    const r = await service.updateDiaEquipe(2026, 5, '2026-05-01', null);
    expect(r.diaEquipe['2026-05-01']).toBeUndefined();
  });

  it('lança erro se mês não importado', async () => {
    await expect(service.updateDiaEquipe(2026, 11, '2026-11-01', 'A')).rejects.toThrow(
      /não importada/,
    );
  });
});

describe('EscalasService.upsertComposicao (F4)', () => {
  let service: EscalasService;
  beforeEach(async () => {
    service = makeSvc();
    await service.save(fakeEscala());
  });

  it('insere nova posição na 1ª quinzena', async () => {
    const r = await service.upsertComposicao(2026, 5, 1, {
      equipe: 'C',
      viatura: 'GUARDA',
      funcao: 'Sent. 1',
      militar: { raw: 'SD NOVO', postoAbreviado: 'SD', nomeGuerra: 'NOVO' },
    });
    const novo = r.composicaoPorQuinzena.q1.find(
      (c) => c.equipe === 'C' && c.viatura === 'GUARDA' && c.funcao === 'Sent. 1',
    );
    expect(novo?.militar.nomeGuerra).toBe('NOVO');
  });

  it('atualiza posição existente (mesma chave) na 1ª quinzena', async () => {
    const r = await service.upsertComposicao(2026, 5, 1, {
      equipe: 'C',
      viatura: 'ABTS 01',
      funcao: 'Ch',
      militar: { raw: 'CB SUBSTITUTO', postoAbreviado: 'CB', nomeGuerra: 'SUBSTITUTO' },
    });
    const ch = r.composicaoPorQuinzena.q1.find((c) => c.equipe === 'C' && c.funcao === 'Ch');
    expect(ch?.militar.nomeGuerra).toBe('SUBSTITUTO');
    expect(
      r.composicaoPorQuinzena.q1.filter((c) => c.equipe === 'C' && c.funcao === 'Ch'),
    ).toHaveLength(1);
  });

  it('remove posição quando militar=null', async () => {
    const r = await service.upsertComposicao(2026, 5, 1, {
      equipe: 'C',
      viatura: 'ABTS 01',
      funcao: 'Ch',
      militar: null,
    });
    expect(
      r.composicaoPorQuinzena.q1.find((c) => c.equipe === 'C' && c.funcao === 'Ch'),
    ).toBeUndefined();
  });

  it('upsert na 2ª quinzena não toca a 1ª', async () => {
    const antes = (await service.get(2026, 5))!;
    const r = await service.upsertComposicao(2026, 5, 2, {
      equipe: 'C',
      viatura: 'ABTS 01',
      funcao: 'Ch',
      militar: { raw: 'CB SUBSTITUTO 2Q', postoAbreviado: 'CB', nomeGuerra: 'SUBSTITUTO 2Q' },
    });
    expect(r.composicaoPorQuinzena.q1).toEqual(antes.composicaoPorQuinzena.q1);
    const ch2 = r.composicaoPorQuinzena.q2.find((c) => c.equipe === 'C' && c.funcao === 'Ch');
    expect(ch2?.militar.nomeGuerra).toBe('SUBSTITUTO 2Q');
  });
});

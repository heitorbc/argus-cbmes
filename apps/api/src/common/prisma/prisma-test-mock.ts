import type {
  ComposicaoEntry as PrismaCE,
  EscalaEspecialAto as PrismaEA,
  EscalaEspecialMensal as PrismaEEM,
  EscalaMensal as PrismaEM,
  NotaServico as PrismaNS,
} from '@prisma/client';
import { Prisma } from '@prisma/client';
import type { PrismaService } from './prisma.service';

/**
 * Resolve sentinelas Prisma (`Prisma.JsonNull`, `Prisma.DbNull`) para
 * `null` puro — o mock armazena objetos JS, não as enums do Prisma.
 */
function normalizeJson<T>(value: T | undefined): T | null {
  if (value === undefined) return null;
  if (value === Prisma.JsonNull || value === Prisma.DbNull) return null;
  return value;
}

/**
 * S2.10.5 — Mock in-memory de `PrismaService` para tests que não precisam
 * de Postgres real. Cobre os 5 models das escalas: EscalaMensal +
 * ComposicaoEntry, EscalaEspecialMensal + EscalaEspecialAto, NotaServico.
 *
 * Suporta `$transaction(cb)` passando o próprio mock como `tx`. Não cobre
 * queries complexas — apenas o subset usado pelos services correspondentes.
 *
 * Sem auth/users/militares/viaturas — esses mocks ficam em cada test
 * específico para evitar sobrecarga.
 */
export function makeEscalasPrismaMock(): PrismaService {
  // ── EscalaMensal + ComposicaoEntry ─────────────────────────────────
  const emById = new Map<string, PrismaEM>();
  const ceByEmId = new Map<string, PrismaCE[]>();
  let emCounter = 1;
  let ceCounter = 1;

  const escalaMensal = {
    count: async () => emById.size,
    findUnique: async ({
      where,
      include,
    }: {
      where: { ano_mes: { ano: number; mes: number } };
      include?: { composicaoEntries?: boolean };
      select?: unknown;
    }) => {
      for (const m of emById.values()) {
        if (m.ano === where.ano_mes.ano && m.mes === where.ano_mes.mes) {
          return include?.composicaoEntries
            ? ({ ...m, composicaoEntries: ceByEmId.get(m.id) ?? [] } as PrismaEM & {
                composicaoEntries: PrismaCE[];
              })
            : m;
        }
      }
      return null;
    },
    findMany: async () => {
      return [...emById.values()].sort((a, b) => b.ano - a.ano || b.mes - a.mes);
    },
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const id = `em-${emCounter++}`;
      const m: PrismaEM = {
        id,
        ano: data.ano as number,
        mes: data.mes as number,
        origemArquivo: data.origemArquivo as string,
        importadoEm: data.importadoEm as Date,
        importadoPorNf: (data.importadoPorNf as string | null | undefined) ?? null,
        diaEquipe: normalizeJson(data.diaEquipe as PrismaEM['diaEquipe']),
        avisos: normalizeJson(data.avisos as PrismaEM['avisos']),
        mergulho: normalizeJson(data.mergulho as PrismaEM['mergulho']),
        salvamar: normalizeJson(data.salvamar as PrismaEM['salvamar']),
        ultimoDiaQ1: (data.ultimoDiaQ1 as number) ?? 14,
      };
      emById.set(id, m);
      const created = data.composicaoEntries as
        | { create: Array<Omit<PrismaCE, 'id' | 'escalaMensalId'>> }
        | undefined;
      const entries: PrismaCE[] = (created?.create ?? []).map((c) => ({
        ...c,
        id: `ce-${ceCounter++}`,
        escalaMensalId: id,
      }));
      ceByEmId.set(id, entries);
      return m;
    },
    update: async ({
      where,
      data,
    }: {
      where: { id?: string; ano_mes?: { ano: number; mes: number } };
      data: Record<string, unknown>;
    }) => {
      let id: string | undefined = where.id;
      if (!id && where.ano_mes) {
        for (const [k, m] of emById.entries()) {
          if (m.ano === where.ano_mes.ano && m.mes === where.ano_mes.mes) {
            id = k;
            break;
          }
        }
      }
      if (!id) throw new Error('Not found');
      const cur = emById.get(id);
      if (!cur) throw new Error(`No em ${id}`);
      const { composicaoEntries: _ce, ...rest } = data;
      const restNormalized = { ...rest } as Record<string, unknown>;
      for (const k of ['diaEquipe', 'avisos', 'mergulho', 'salvamar'] as const) {
        if (k in restNormalized) restNormalized[k] = normalizeJson(restNormalized[k] as unknown);
      }
      const next: PrismaEM = { ...cur, ...(restNormalized as Partial<PrismaEM>) };
      emById.set(id, next);
      const created = data.composicaoEntries as
        | { create: Array<Omit<PrismaCE, 'id' | 'escalaMensalId'>> }
        | undefined;
      if (created?.create) {
        ceByEmId.set(
          id,
          created.create.map((c) => ({
            ...c,
            id: `ce-${ceCounter++}`,
            escalaMensalId: id!,
          })),
        );
      }
      return next;
    },
    delete: async ({ where }: { where: { ano_mes: { ano: number; mes: number } } }) => {
      for (const [id, m] of emById.entries()) {
        if (m.ano === where.ano_mes.ano && m.mes === where.ano_mes.mes) {
          emById.delete(id);
          ceByEmId.delete(id);
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
      const cur = ceByEmId.get(where.escalaMensalId) ?? [];
      const onlyId =
        where.quinzena === undefined &&
        where.equipe === undefined &&
        where.viatura === undefined &&
        where.funcao === undefined;
      if (onlyId) {
        ceByEmId.set(where.escalaMensalId, []);
        return { count: cur.length };
      }
      const next = cur.filter(
        (e) =>
          (where.quinzena !== undefined && e.quinzena !== where.quinzena) ||
          (where.equipe !== undefined && e.equipe !== where.equipe) ||
          (where.viatura !== undefined && e.viatura !== where.viatura) ||
          (where.funcao !== undefined && e.funcao !== where.funcao),
      );
      ceByEmId.set(where.escalaMensalId, next);
      return { count: cur.length - next.length };
    },
    create: async ({ data }: { data: Omit<PrismaCE, 'id'> }) => {
      const cur = ceByEmId.get(data.escalaMensalId) ?? [];
      const entry: PrismaCE = { ...data, id: `ce-${ceCounter++}` };
      cur.push(entry);
      ceByEmId.set(data.escalaMensalId, cur);
      return entry;
    },
  };

  // ── EscalaEspecialMensal + EscalaEspecialAto ───────────────────────
  const eemById = new Map<string, PrismaEEM>();
  const eaByEemId = new Map<string, PrismaEA[]>();
  let eemCounter = 1;
  let eaCounter = 1;

  const escalaEspecialMensal = {
    count: async () => eemById.size,
    findUnique: async ({
      where,
      include,
    }: {
      where: { ano_mes: { ano: number; mes: number } };
      include?: { atos?: boolean };
    }) => {
      for (const m of eemById.values()) {
        if (m.ano === where.ano_mes.ano && m.mes === where.ano_mes.mes) {
          return include?.atos
            ? ({ ...m, atos: eaByEemId.get(m.id) ?? [] } as PrismaEEM & { atos: PrismaEA[] })
            : m;
        }
      }
      return null;
    },
    findMany: async () => {
      return [...eemById.values()]
        .sort((a, b) => b.ano - a.ano || b.mes - a.mes)
        .map((m) => ({ ...m, _count: { atos: (eaByEemId.get(m.id) ?? []).length } }));
    },
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const id = `eem-${eemCounter++}`;
      const m: PrismaEEM = {
        id,
        ano: data.ano as number,
        mes: data.mes as number,
        origemArquivo: data.origemArquivo as string,
        importadoEm: data.importadoEm as Date,
        importadoPorNf: (data.importadoPorNf as string | null | undefined) ?? null,
        avisos: (data.avisos as PrismaEEM['avisos']) ?? null,
      };
      eemById.set(id, m);
      const created = data.atos as
        | { create: Array<Omit<PrismaEA, 'id' | 'escalaEspecialId'>> }
        | undefined;
      eaByEemId.set(
        id,
        (created?.create ?? []).map((a) => ({
          ...a,
          id: `ea-${eaCounter++}`,
          escalaEspecialId: id,
        })),
      );
      return m;
    },
    update: async ({
      where,
      data,
    }: {
      where: { id?: string; ano_mes?: { ano: number; mes: number } };
      data: Record<string, unknown>;
    }) => {
      let id: string | undefined = where.id;
      if (!id && where.ano_mes) {
        for (const [k, m] of eemById.entries()) {
          if (m.ano === where.ano_mes.ano && m.mes === where.ano_mes.mes) {
            id = k;
            break;
          }
        }
      }
      if (!id) throw new Error('Not found');
      const cur = eemById.get(id);
      if (!cur) throw new Error(`No eem ${id}`);
      const { atos: _atos, ...rest } = data;
      const next: PrismaEEM = { ...cur, ...(rest as Partial<PrismaEEM>) };
      eemById.set(id, next);
      const created = data.atos as
        | { create: Array<Omit<PrismaEA, 'id' | 'escalaEspecialId'>> }
        | undefined;
      if (created?.create) {
        eaByEemId.set(
          id,
          created.create.map((a) => ({
            ...a,
            id: `ea-${eaCounter++}`,
            escalaEspecialId: id!,
          })),
        );
      }
      return next;
    },
    delete: async ({ where }: { where: { ano_mes: { ano: number; mes: number } } }) => {
      for (const [id, m] of eemById.entries()) {
        if (m.ano === where.ano_mes.ano && m.mes === where.ano_mes.mes) {
          eemById.delete(id);
          eaByEemId.delete(id);
          return m;
        }
      }
      throw new Error('Not found');
    },
  };

  const escalaEspecialAto = {
    deleteMany: async ({ where }: { where: { escalaEspecialId: string } }) => {
      eaByEemId.delete(where.escalaEspecialId);
      return { count: 0 };
    },
    findMany: async ({
      where,
    }: {
      where: { data: string; escalaEspecial: { ano: number; mes: number } };
    }) => {
      const m = [...eemById.values()].find(
        (x) => x.ano === where.escalaEspecial.ano && x.mes === where.escalaEspecial.mes,
      );
      if (!m) return [];
      return (eaByEemId.get(m.id) ?? []).filter((a) => a.data === where.data);
    },
  };

  // ── NotaServico ────────────────────────────────────────────────────
  const nsById = new Map<string, PrismaNS>();
  let nsCounter = 1;

  const notaServico = {
    count: async ({ where }: { where?: { deletedAt: null } } = {}) => {
      const arr = [...nsById.values()];
      return where?.deletedAt === null ? arr.filter((n) => !n.deletedAt).length : arr.length;
    },
    findMany: async ({
      where,
      orderBy: _orderBy,
    }: {
      where?: { deletedAt?: null; data?: string; militaresNfs?: { has: string } };
      orderBy?: unknown;
    } = {}) => {
      let arr = [...nsById.values()];
      if (where?.deletedAt === null) arr = arr.filter((n) => !n.deletedAt);
      if (where?.data) arr = arr.filter((n) => n.data === where.data);
      if (where?.militaresNfs?.has)
        arr = arr.filter((n) => n.militaresNfs.includes(where.militaresNfs!.has));
      return arr.sort((a, b) => {
        const c = b.data.localeCompare(a.data);
        return c !== 0 ? c : a.horaInicio.localeCompare(b.horaInicio);
      });
    },
    findFirst: async ({
      where,
    }: {
      where?: { id?: string; data?: string; codigo?: string; deletedAt?: null };
    } = {}) => {
      for (const n of nsById.values()) {
        if (where?.deletedAt === null && n.deletedAt) continue;
        if (where?.id && n.id !== where.id) continue;
        if (where?.data && n.data !== where.data) continue;
        if (where?.codigo && n.codigo !== where.codigo) continue;
        return n;
      }
      return null;
    },
    create: async ({ data }: { data: Partial<PrismaNS> }) => {
      const id = `ns:t-${nsCounter++}`;
      const now = new Date();
      const row: PrismaNS = {
        id,
        codigo: data.codigo as string,
        descricao: data.descricao as string,
        data: data.data as string,
        horaInicio: data.horaInicio as string,
        horaFim: data.horaFim as string,
        viaturaPrefixo: (data.viaturaPrefixo as string | null | undefined) ?? null,
        militaresNfs: (data.militaresNfs as string[] | undefined) ?? [],
        observacoes: (data.observacoes as string | null | undefined) ?? null,
        criadoEm: now,
        criadoPorNf: data.criadoPorNf as string,
        atualizadoEm: now,
        deletedAt: null,
      };
      nsById.set(id, row);
      return row;
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<PrismaNS> }) => {
      const cur = nsById.get(where.id);
      if (!cur) throw new Error(`No ns ${where.id}`);
      const next: PrismaNS = { ...cur, ...data, atualizadoEm: new Date() };
      nsById.set(where.id, next);
      return next;
    },
  };

  const prismaLike = {
    escalaMensal,
    composicaoEntry,
    escalaEspecialMensal,
    escalaEspecialAto,
    notaServico,
    $transaction: async (cb: (tx: unknown) => Promise<unknown>) => cb(prismaLike),
  };
  return prismaLike as unknown as PrismaService;
}

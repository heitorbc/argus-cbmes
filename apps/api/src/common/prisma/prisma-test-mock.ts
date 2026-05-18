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

/**
 * S2.10.7c — Mock in-memory mínimo de `PrismaService` cobrindo apenas
 * `aprovacaoPreviaItem` (decisões individuais do Fiscal sobre trocas,
 * dispensas e atestados). Usado nos tests de `AjustesPreviaService` que não
 * precisam das tabelas pesadas de escalas.
 *
 * Suporta: findMany({ where: { data } }), upsert({ where: { data_tipo_itemId } }),
 * deleteMany({ where: { data } }). Não suporta queries arbitrárias.
 */
export function makeAprovacoesPrismaMock(): PrismaService {
  type Row = {
    id: string;
    data: string;
    tipo: string;
    itemId: string;
    status: string;
    decididoPorNf: string;
    decididoEm: Date;
  };
  const rows = new Map<string, Row>();
  let counter = 1;
  const compositeKey = (data: string, tipo: string, itemId: string) => `${data}|${tipo}|${itemId}`;

  const aprovacaoPreviaItem = {
    findMany: async ({ where }: { where: { data: string } }) => {
      const out: Row[] = [];
      for (const r of rows.values()) {
        if (r.data === where.data) out.push(r);
      }
      return out;
    },
    upsert: async ({
      where,
      create,
      update,
    }: {
      where: { data_tipo_itemId: { data: string; tipo: string; itemId: string } };
      create: Omit<Row, 'id' | 'decididoEm'>;
      update: Partial<Pick<Row, 'status' | 'decididoPorNf' | 'decididoEm'>>;
    }) => {
      const k = compositeKey(
        where.data_tipo_itemId.data,
        where.data_tipo_itemId.tipo,
        where.data_tipo_itemId.itemId,
      );
      const existing = rows.get(k);
      if (existing) {
        const next: Row = {
          ...existing,
          status: update.status ?? existing.status,
          decididoPorNf: update.decididoPorNf ?? existing.decididoPorNf,
          decididoEm: update.decididoEm ?? new Date(),
        };
        rows.set(k, next);
        return next;
      }
      const next: Row = {
        id: `apv-${counter++}`,
        data: create.data,
        tipo: create.tipo,
        itemId: create.itemId,
        status: create.status,
        decididoPorNf: create.decididoPorNf,
        decididoEm: new Date(),
      };
      rows.set(k, next);
      return next;
    },
    deleteMany: async ({ where }: { where: { data: string } }) => {
      let count = 0;
      for (const [k, r] of rows.entries()) {
        if (r.data === where.data) {
          rows.delete(k);
          count++;
        }
      }
      return { count };
    },
  };

  const prismaLike = {
    aprovacaoPreviaItem,
  };
  return prismaLike as unknown as PrismaService;
}

/**
 * S2.10.7d — Mock in-memory de `PrismaService` para `dispensa` + `militar`.
 * Cobre o subset usado por `DispensasService` e `DispensasImportService`:
 * findMany/findUnique/findFirst, create/update, upsert por
 * (militarNf, dataInicio, tipo).
 */
export function makeDispensasPrismaMock(): PrismaService {
  type DispensaRow = {
    id: string;
    militarNf: string;
    tipo: string;
    dataInicio: string;
    dias: number;
    numeroEdocs: string | null;
    observacoes: string | null;
    minuta: string | null;
    equipe: string | null;
    origem: string;
    criadoEm: Date;
    criadoPorNf: string | null;
    atualizadoEm: Date;
    deletedAt: Date | null;
  };
  const dispensas = new Map<string, DispensaRow>();
  const militares = new Map<string, Record<string, unknown> & { nf: string }>();
  let counter = 1;

  const matchWhere = (row: DispensaRow, where: Record<string, unknown>): boolean => {
    if (where.id !== undefined && row.id !== where.id) return false;
    if (where.militarNf !== undefined && row.militarNf !== where.militarNf) return false;
    if (where.tipo !== undefined && row.tipo !== where.tipo) return false;
    if (where.deletedAt === null && row.deletedAt !== null) return false;
    if (where.dataInicio !== undefined) {
      const di = where.dataInicio;
      if (typeof di === 'string') {
        if (row.dataInicio !== di) return false;
      } else if (di && typeof di === 'object') {
        const cond = di as { gte?: string; lte?: string };
        if (cond.gte !== undefined && row.dataInicio < cond.gte) return false;
        if (cond.lte !== undefined && row.dataInicio > cond.lte) return false;
      }
    }
    return true;
  };

  const dispensa = {
    findMany: async ({
      where = {},
      orderBy,
    }: {
      where?: Record<string, unknown>;
      orderBy?: unknown;
    } = {}) => {
      let out = Array.from(dispensas.values()).filter((r) => matchWhere(r, where));
      // Aplicar orderBy [{ dataInicio: 'desc' }, { criadoEm: 'desc' }]
      if (Array.isArray(orderBy)) {
        out = out.sort((a, b) => b.dataInicio.localeCompare(a.dataInicio));
      }
      return out;
    },
    findUnique: async ({
      where,
    }: {
      where: {
        id?: string;
        militarNf_dataInicio_tipo?: { militarNf: string; dataInicio: string; tipo: string };
      };
    }) => {
      if (where.id) return dispensas.get(where.id) ?? null;
      if (where.militarNf_dataInicio_tipo) {
        const { militarNf, dataInicio, tipo } = where.militarNf_dataInicio_tipo;
        for (const r of dispensas.values()) {
          if (r.militarNf === militarNf && r.dataInicio === dataInicio && r.tipo === tipo) {
            return r;
          }
        }
      }
      return null;
    },
    findFirst: async ({ where = {} }: { where?: Record<string, unknown> } = {}) => {
      for (const r of dispensas.values()) {
        if (matchWhere(r, where)) return r;
      }
      return null;
    },
    create: async ({ data }: { data: Partial<DispensaRow> }) => {
      const id = `disp-${counter++}`;
      const now = new Date();
      const row: DispensaRow = {
        id,
        militarNf: (data.militarNf as string) ?? '',
        tipo: (data.tipo as string) ?? '',
        dataInicio: (data.dataInicio as string) ?? '',
        dias: (data.dias as number) ?? 0,
        numeroEdocs: (data.numeroEdocs as string | null) ?? null,
        observacoes: (data.observacoes as string | null) ?? null,
        minuta: (data.minuta as string | null) ?? null,
        equipe: (data.equipe as string | null) ?? null,
        origem: (data.origem as string) ?? 'manual',
        criadoEm: now,
        criadoPorNf: (data.criadoPorNf as string | null) ?? null,
        atualizadoEm: now,
        deletedAt: null,
      };
      dispensas.set(id, row);
      return row;
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<DispensaRow> }) => {
      const cur = dispensas.get(where.id);
      if (!cur) throw new Error(`No dispensa ${where.id}`);
      const next: DispensaRow = {
        ...cur,
        ...data,
        atualizadoEm: new Date(),
      };
      dispensas.set(where.id, next);
      return next;
    },
  };

  const militar = {
    findUnique: async ({ where }: { where: { nf: string }; select?: unknown }) =>
      militares.get(where.nf) ?? null,
    upsert: async ({
      where,
      create,
      update,
    }: {
      where: { nf: string };
      create: Record<string, unknown> & { nf: string };
      update: Record<string, unknown>;
    }) => {
      const existing = militares.get(where.nf);
      if (existing) {
        const merged = { ...existing, ...update };
        militares.set(where.nf, merged);
        return merged;
      }
      militares.set(where.nf, create);
      return create;
    },
  };

  // Test helper: pré-popular militares (FK simulada)
  const _seedMilitar = (nf: string) => militares.set(nf, { nf });

  const prismaLike = {
    dispensa,
    militar,
    _seedMilitar,
  };
  return prismaLike as unknown as PrismaService & { _seedMilitar: (nf: string) => void };
}

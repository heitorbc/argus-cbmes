import { describe, it, expect, beforeEach } from 'vitest';
import type { Unidade as PrismaUnidade } from '@prisma/client';
import {
  UnidadesService,
  UNIDADE_1CIA_1BBM_CODIGO,
  UNIDADE_1CIA_1BBM_ID,
} from './unidades.service';
import type { PrismaService } from '../../common/prisma/prisma.service';

function makePrismaMock(): PrismaService {
  const store = new Map<string, PrismaUnidade>();
  const byCodigo = (): Map<string, PrismaUnidade> => {
    const m = new Map<string, PrismaUnidade>();
    for (const u of store.values()) m.set(u.codigo, u);
    return m;
  };
  let counter = 1;
  const unidade = {
    findMany: async ({ orderBy }: { orderBy?: { codigo: 'asc' } } = {}) => {
      const arr = [...store.values()];
      if (orderBy?.codigo === 'asc') arr.sort((a, b) => a.codigo.localeCompare(b.codigo));
      return arr;
    },
    findUnique: async ({ where }: { where: { id?: string; codigo?: string } }) => {
      if (where.id) return store.get(where.id) ?? null;
      if (where.codigo) return byCodigo().get(where.codigo) ?? null;
      return null;
    },
    create: async ({
      data,
    }: {
      data: { id?: string; codigo: string; nome: string; ativo?: boolean };
    }) => {
      const id = data.id ?? `unid:gen-${counter++}`;
      const now = new Date();
      const u: PrismaUnidade = {
        id,
        codigo: data.codigo,
        nome: data.nome,
        ativo: data.ativo ?? true,
        criadoEm: now,
        atualizadoEm: now,
      };
      store.set(id, u);
      return u;
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<PrismaUnidade> }) => {
      const u = store.get(where.id);
      if (!u) throw new Error(`No unidade ${where.id}`);
      const next: PrismaUnidade = { ...u, ...data, atualizadoEm: new Date() };
      store.set(where.id, next);
      return next;
    },
    upsert: async ({
      where,
      create,
      update,
    }: {
      where: { codigo: string };
      create: { id?: string; codigo: string; nome: string; ativo?: boolean };
      update: Partial<PrismaUnidade>;
    }) => {
      const existing = byCodigo().get(where.codigo);
      if (existing) {
        const next = { ...existing, ...update, atualizadoEm: new Date() };
        store.set(existing.id, next);
        return next;
      }
      const id = create.id ?? `unid:gen-${counter++}`;
      const now = new Date();
      const u: PrismaUnidade = {
        id,
        codigo: create.codigo,
        nome: create.nome,
        ativo: create.ativo ?? true,
        criadoEm: now,
        atualizadoEm: now,
      };
      store.set(id, u);
      return u;
    },
  };
  return { unidade } as unknown as PrismaService;
}

async function makeSvc(): Promise<UnidadesService> {
  const svc = new UnidadesService(makePrismaMock());
  await svc.onModuleInit();
  return svc;
}

describe('UnidadesService', () => {
  let svc: UnidadesService;

  beforeEach(async () => {
    svc = await makeSvc();
  });

  it('seed cria a 1ª1º com codigo e nome corretos', async () => {
    const all = await svc.list();
    expect(all).toHaveLength(1);
    expect(all[0]?.codigo).toBe(UNIDADE_1CIA_1BBM_CODIGO);
    expect(all[0]?.nome).toBe('1ª Cia / 1º BBM');
    expect(all[0]?.ativo).toBe(true);
  });

  it('findById resolve o slug fixo', async () => {
    const u = await svc.findById(UNIDADE_1CIA_1BBM_ID);
    expect(u.id).toBe(UNIDADE_1CIA_1BBM_ID);
  });

  it('findById lança NotFoundException para id desconhecido', async () => {
    await expect(svc.findById('unid:nao-existe')).rejects.toThrow();
  });

  it('findByCodigo localiza por código curto', async () => {
    expect((await svc.findByCodigo(UNIDADE_1CIA_1BBM_CODIGO))?.id).toBe(UNIDADE_1CIA_1BBM_ID);
    expect(await svc.findByCodigo('inexistente')).toBeUndefined();
  });
});

describe('UnidadesService — CRUD admin (S6e)', () => {
  let svc: UnidadesService;

  beforeEach(async () => {
    svc = await makeSvc();
  });

  it('create adiciona nova unidade com ativo=true por padrão', async () => {
    const u = await svc.create({ codigo: '2ª1º', nome: '2ª Cia / 1º BBM' });
    expect(u.codigo).toBe('2ª1º');
    expect(u.ativo).toBe(true);
    expect(u.id).toBeTruthy();
    expect(await svc.list()).toHaveLength(2);
  });

  it('create rejeita codigo duplicado com 409', async () => {
    await expect(
      svc.create({ codigo: UNIDADE_1CIA_1BBM_CODIGO, nome: 'duplicada' }),
    ).rejects.toThrow();
  });

  it('update muda nome preservando codigo e id', async () => {
    const u = await svc.update(UNIDADE_1CIA_1BBM_ID, { nome: 'Novo Nome' });
    expect(u.nome).toBe('Novo Nome');
    expect(u.codigo).toBe(UNIDADE_1CIA_1BBM_CODIGO);
    expect(u.id).toBe(UNIDADE_1CIA_1BBM_ID);
  });

  it('update rejeita mudança para codigo já existente', async () => {
    await svc.create({ codigo: '2ª1º', nome: 'Segunda' });
    const segunda = (await svc.findByCodigo('2ª1º'))!;
    await expect(svc.update(segunda.id, { codigo: UNIDADE_1CIA_1BBM_CODIGO })).rejects.toThrow();
  });

  it('softDelete marca ativo=false sem remover do storage', async () => {
    const u = await svc.softDelete(UNIDADE_1CIA_1BBM_ID);
    expect(u.ativo).toBe(false);
    expect((await svc.findById(UNIDADE_1CIA_1BBM_ID)).ativo).toBe(false);
    expect(await svc.list()).toHaveLength(1);
  });
});

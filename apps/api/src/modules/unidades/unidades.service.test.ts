import { describe, it, expect, beforeEach } from 'vitest';
import type { Unidade as PrismaUnidade } from '@prisma/client';
import type { UserSession } from '@argus/shared-types';
import {
  UnidadesService,
  UNIDADE_1BBM_CODIGO,
  UNIDADE_1BBM_ID,
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
      data: {
        id?: string;
        codigo: string;
        nome: string;
        tipo?: string;
        unidadePaiId?: string | null;
        ativo?: boolean;
        criacaoAutomatica?: boolean;
      };
    }) => {
      const id = data.id ?? `unid:gen-${counter++}`;
      const now = new Date();
      const u: PrismaUnidade = {
        id,
        codigo: data.codigo,
        nome: data.nome,
        tipo: data.tipo ?? 'companhia',
        unidadePaiId: data.unidadePaiId ?? null,
        ativo: data.ativo ?? true,
        criacaoAutomatica: data.criacaoAutomatica ?? false,
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
      create: {
        id?: string;
        codigo: string;
        nome: string;
        tipo?: string;
        unidadePaiId?: string | null;
        ativo?: boolean;
        criacaoAutomatica?: boolean;
      };
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
        tipo: create.tipo ?? 'companhia',
        unidadePaiId: create.unidadePaiId ?? null,
        ativo: create.ativo ?? true,
        criacaoAutomatica: create.criacaoAutomatica ?? false,
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

function makeUser(papeis: UserSession['papeis'], unidadeId?: string): UserSession {
  return {
    nf: '3037509',
    nome: 'TEST USER',
    posto: '2ºSGT',
    ant: 1,
    papeis,
    primeiroAcesso: false,
    unidadeId,
  };
}

describe('UnidadesService — seed hierárquico (S2.13a)', () => {
  let svc: UnidadesService;

  beforeEach(async () => {
    svc = await makeSvc();
  });

  it('seed cria 1º BBM (batalhao) + 1ª Cia (companhia, pai=1º BBM)', async () => {
    const all = await svc.list();
    expect(all).toHaveLength(2);
    const bbm = all.find((u) => u.codigo === UNIDADE_1BBM_CODIGO);
    const cia = all.find((u) => u.codigo === UNIDADE_1CIA_1BBM_CODIGO);
    expect(bbm?.tipo).toBe('batalhao');
    expect(bbm?.unidadePaiId).toBeNull();
    expect(cia?.tipo).toBe('companhia');
    expect(cia?.unidadePaiId).toBe(UNIDADE_1BBM_ID);
  });

  it('findById resolve o slug fixo da 1ª Cia', async () => {
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

describe('UnidadesService — CRUD admin (S6e + S2.13a)', () => {
  let svc: UnidadesService;

  beforeEach(async () => {
    svc = await makeSvc();
  });

  it('create adiciona nova unidade com tipo padrão companhia + ativo=true', async () => {
    const u = await svc.create({ codigo: '2ª1º', nome: '2ª Cia / 1º BBM' });
    expect(u.codigo).toBe('2ª1º');
    expect(u.tipo).toBe('companhia');
    expect(u.unidadePaiId).toBeNull();
    expect(u.ativo).toBe(true);
    expect(u.id).toBeTruthy();
    expect(await svc.list()).toHaveLength(3);
  });

  it('create aceita unidadePaiId explícito (posto avançado)', async () => {
    const cia = await svc.create({
      codigo: '3ªIND',
      nome: '3ª CIA IND COLATINA',
      tipo: 'companhia',
      unidadePaiId: UNIDADE_1BBM_ID,
    });
    const pab = await svc.create({
      codigo: 'PAB-BG',
      nome: 'PAB Baixo Guandu',
      tipo: 'posto_avancado',
      unidadePaiId: cia.id,
    });
    expect(pab.tipo).toBe('posto_avancado');
    expect(pab.unidadePaiId).toBe(cia.id);
  });

  it('create rejeita unidadePaiId inexistente com 400', async () => {
    await expect(
      svc.create({ codigo: 'X', nome: 'X', unidadePaiId: 'unid:fantasma' }),
    ).rejects.toThrow();
  });

  it('create rejeita codigo duplicado com 409', async () => {
    await expect(
      svc.create({ codigo: UNIDADE_1CIA_1BBM_CODIGO, nome: 'duplicada' }),
    ).rejects.toThrow();
  });

  it('update muda nome preservando codigo, id e hierarquia', async () => {
    const u = await svc.update(UNIDADE_1CIA_1BBM_ID, { nome: 'Novo Nome' });
    expect(u.nome).toBe('Novo Nome');
    expect(u.codigo).toBe(UNIDADE_1CIA_1BBM_CODIGO);
    expect(u.id).toBe(UNIDADE_1CIA_1BBM_ID);
    expect(u.tipo).toBe('companhia');
    expect(u.unidadePaiId).toBe(UNIDADE_1BBM_ID);
  });

  it('update rejeita mudança para codigo já existente', async () => {
    await svc.create({ codigo: '2ª1º', nome: 'Segunda' });
    const segunda = (await svc.findByCodigo('2ª1º'))!;
    await expect(svc.update(segunda.id, { codigo: UNIDADE_1CIA_1BBM_CODIGO })).rejects.toThrow();
  });

  it('update rejeita ciclo (pai = própria unidade)', async () => {
    await expect(svc.update(UNIDADE_1BBM_ID, { unidadePaiId: UNIDADE_1BBM_ID })).rejects.toThrow();
  });

  it('update rejeita ciclo (pai descendente da unidade)', async () => {
    // 1º BBM tentaria virar filho da 1ª Cia (que é filha do 1º BBM)
    await expect(
      svc.update(UNIDADE_1BBM_ID, { unidadePaiId: UNIDADE_1CIA_1BBM_ID }),
    ).rejects.toThrow();
  });

  it('softDelete marca ativo=false sem remover do storage', async () => {
    const u = await svc.softDelete(UNIDADE_1CIA_1BBM_ID);
    expect(u.ativo).toBe(false);
    expect((await svc.findById(UNIDADE_1CIA_1BBM_ID)).ativo).toBe(false);
    expect(await svc.list()).toHaveLength(2);
  });
});

describe('UnidadesService.descendantsOf + visiveisParaUsuario (S2.13a)', () => {
  let svc: UnidadesService;

  beforeEach(async () => {
    svc = await makeSvc();
    // Seed adicional: 3ª CIA IND COLATINA + PAB Baixo Guandu
    const colatina = await svc.create({
      codigo: '3ªIND',
      nome: '3ª CIA IND COLATINA',
      tipo: 'companhia',
      unidadePaiId: UNIDADE_1BBM_ID,
    });
    await svc.create({
      codigo: 'PAB-BG',
      nome: 'PAB Baixo Guandu',
      tipo: 'posto_avancado',
      unidadePaiId: colatina.id,
    });
  });

  it('descendantsOf(1º BBM) retorna 1ª Cia + 3ª CIA + PAB (recursivo 3 níveis)', async () => {
    const desc = await svc.descendantsOf(UNIDADE_1BBM_ID);
    const codigos = desc.map((d) => d.codigo).sort();
    expect(codigos).toEqual(['1ª1º', '3ªIND', 'PAB-BG']);
  });

  it('descendantsOf(3ª CIA) retorna apenas PAB Baixo Guandu', async () => {
    const colatina = (await svc.findByCodigo('3ªIND'))!;
    const desc = await svc.descendantsOf(colatina.id);
    expect(desc).toHaveLength(1);
    expect(desc[0]?.codigo).toBe('PAB-BG');
  });

  it('descendantsOf(PAB) retorna lista vazia (folha)', async () => {
    const pab = (await svc.findByCodigo('PAB-BG'))!;
    expect(await svc.descendantsOf(pab.id)).toEqual([]);
  });

  it('visiveisParaUsuario(admin) retorna TODAS as unidades', async () => {
    const u = await svc.visiveisParaUsuario(makeUser(['admin']));
    expect(u.map((x) => x.codigo).sort()).toEqual(['1ª1º', '1º BBM', '3ªIND', 'PAB-BG']);
  });

  it('visiveisParaUsuario(usuário sem unidadeId) retorna TODAS (sessão legada)', async () => {
    const u = await svc.visiveisParaUsuario(makeUser(['sargenteante']));
    expect(u.length).toBe(4);
  });

  it('visiveisParaUsuario(sargenteante de 3ª CIA) retorna 3ª CIA + PAB (filho)', async () => {
    const colatina = (await svc.findByCodigo('3ªIND'))!;
    const u = await svc.visiveisParaUsuario(makeUser(['sargenteante'], colatina.id));
    expect(u.map((x) => x.codigo).sort()).toEqual(['3ªIND', 'PAB-BG']);
  });

  it('visiveisParaUsuario(usuário de PAB) retorna só PAB (folha sem descendentes)', async () => {
    const pab = (await svc.findByCodigo('PAB-BG'))!;
    const u = await svc.visiveisParaUsuario(makeUser(['sargenteante'], pab.id));
    expect(u.map((x) => x.codigo)).toEqual(['PAB-BG']);
  });

  it('visiveisParaUsuario(unidadeId apontando para registro removido) retorna []', async () => {
    const u = await svc.visiveisParaUsuario(makeUser(['sargenteante'], 'unid:fantasma'));
    expect(u).toEqual([]);
  });

  it('idsVisiveisParaUsuario retorna só os IDs', async () => {
    const colatina = (await svc.findByCodigo('3ªIND'))!;
    const ids = await svc.idsVisiveisParaUsuario(makeUser(['sargenteante'], colatina.id));
    expect(ids).toHaveLength(2);
    expect(ids).toContain(colatina.id);
  });
});

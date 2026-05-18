import { describe, it, expect, beforeEach } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import type { NotaServico as PrismaNS } from '@prisma/client';
import { NotasServicoService } from './notas-servico.service';
import type { PrismaService } from '../../common/prisma/prisma.service';

const sargenteanteNf = '9999999';

/**
 * Mock minimal do `prisma.notaServico.*` para tests sem Postgres.
 */
function makePrismaMock(): PrismaService {
  const store = new Map<string, PrismaNS>();
  let counter = 1;
  const notaServico = {
    count: async ({ where }: { where?: { deletedAt: null } } = {}) => {
      const arr = [...store.values()];
      return where?.deletedAt === null ? arr.filter((n) => !n.deletedAt).length : arr.length;
    },
    findMany: async ({
      where,
      orderBy,
    }: {
      where?: {
        deletedAt?: null;
        data?: string;
        militaresNfs?: { has: string };
      };
      orderBy?: Array<{ data?: 'desc'; horaInicio?: 'asc' }>;
    } = {}) => {
      let arr = [...store.values()];
      if (where?.deletedAt === null) arr = arr.filter((n) => !n.deletedAt);
      if (where?.data) arr = arr.filter((n) => n.data === where.data);
      if (where?.militaresNfs?.has)
        arr = arr.filter((n) => n.militaresNfs.includes(where.militaresNfs!.has));
      if (orderBy) {
        arr.sort((a, b) => {
          for (const o of orderBy) {
            if (o.data === 'desc' && a.data !== b.data) return b.data.localeCompare(a.data);
            if (o.horaInicio === 'asc' && a.horaInicio !== b.horaInicio)
              return a.horaInicio.localeCompare(b.horaInicio);
          }
          return 0;
        });
      }
      return arr;
    },
    findFirst: async ({
      where,
    }: {
      where?: { id?: string; data?: string; codigo?: string; deletedAt?: null };
    } = {}) => {
      for (const n of store.values()) {
        if (where?.deletedAt === null && n.deletedAt) continue;
        if (where?.id && n.id !== where.id) continue;
        if (where?.data && n.data !== where.data) continue;
        if (where?.codigo && n.codigo !== where.codigo) continue;
        return n;
      }
      return null;
    },
    create: async ({ data }: { data: Partial<PrismaNS> }) => {
      const id = `ns:test-${counter++}`;
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
      store.set(id, row);
      return row;
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<PrismaNS> }) => {
      const cur = store.get(where.id);
      if (!cur) throw new Error(`No NS ${where.id}`);
      const next: PrismaNS = { ...cur, ...data, atualizadoEm: new Date() };
      store.set(where.id, next);
      return next;
    },
  };
  return { notaServico } as unknown as PrismaService;
}

function makeSvc(): NotasServicoService {
  return new NotasServicoService(makePrismaMock());
}

describe('NotasServicoService (S6l)', () => {
  let svc: NotasServicoService;

  beforeEach(() => {
    svc = makeSvc();
  });

  it('create gera id + timestamps + preserva campos', async () => {
    const n = await svc.create(
      {
        codigo: 'NS077',
        descricao: 'ISEO - Coleta leite materno',
        data: '2026-05-10',
        horaInicio: '08:00',
        horaFim: '12:00',
        viaturaPrefixo: 'AR_044',
        militaresNfs: ['3037509', '3670180'],
        observacoes: 'Levar maca rígida',
      },
      sargenteanteNf,
    );
    expect(n.id).toMatch(/^ns:/);
    expect(n.criadoPorNf).toBe(sargenteanteNf);
    expect(n.criadoEm).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(n.codigo).toBe('NS077');
    expect(n.militaresNfs).toEqual(['3037509', '3670180']);
    expect(n.viaturaPrefixo).toBe('AR_044');
    expect(n.observacoes).toBe('Levar maca rígida');
  });

  it('createOrConflict rejeita duplicata exata (codigo, data)', async () => {
    await svc.create(
      {
        codigo: 'NS077',
        descricao: 'X',
        data: '2026-05-10',
        horaInicio: '08:00',
        horaFim: '12:00',
        militaresNfs: ['3037509'],
      },
      sargenteanteNf,
    );
    await expect(
      svc.createOrConflict(
        {
          codigo: 'NS077',
          descricao: 'Y',
          data: '2026-05-10',
          horaInicio: '14:00',
          horaFim: '18:00',
          militaresNfs: ['3670180'],
        },
        sargenteanteNf,
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('createOrConflict permite mesmo codigo em datas distintas', async () => {
    await svc.create(
      {
        codigo: 'NS001',
        descricao: 'X',
        data: '2026-05-10',
        horaInicio: '08:00',
        horaFim: '12:00',
        militaresNfs: ['3037509'],
      },
      sargenteanteNf,
    );
    const n2 = await svc.createOrConflict(
      {
        codigo: 'NS001',
        descricao: 'Y',
        data: '2026-05-11',
        horaInicio: '08:00',
        horaFim: '12:00',
        militaresNfs: ['3670180'],
      },
      sargenteanteNf,
    );
    expect(n2.codigo).toBe('NS001');
    expect(n2.data).toBe('2026-05-11');
  });

  it('list filtra por data', async () => {
    await svc.create(
      {
        codigo: 'NS001',
        descricao: 'X',
        data: '2026-05-10',
        horaInicio: '08:00',
        horaFim: '12:00',
        militaresNfs: ['3037509'],
      },
      sargenteanteNf,
    );
    await svc.create(
      {
        codigo: 'NS002',
        descricao: 'Y',
        data: '2026-05-11',
        horaInicio: '08:00',
        horaFim: '12:00',
        militaresNfs: ['3037509'],
      },
      sargenteanteNf,
    );
    expect(await svc.list({ data: '2026-05-10' })).toHaveLength(1);
    expect(await svc.list({ data: '2026-05-11' })).toHaveLength(1);
    expect(await svc.list({})).toHaveLength(2);
  });

  it('list filtra por militarNf (NS que envolvem o militar)', async () => {
    await svc.create(
      {
        codigo: 'NS001',
        descricao: 'X',
        data: '2026-05-10',
        horaInicio: '08:00',
        horaFim: '12:00',
        militaresNfs: ['3037509', '3670180'],
      },
      sargenteanteNf,
    );
    await svc.create(
      {
        codigo: 'NS002',
        descricao: 'Y',
        data: '2026-05-11',
        horaInicio: '08:00',
        horaFim: '12:00',
        militaresNfs: ['3670180'],
      },
      sargenteanteNf,
    );
    expect(await svc.list({ militarNf: '3037509' })).toHaveLength(1);
    expect(await svc.list({ militarNf: '3670180' })).toHaveLength(2);
  });

  it('listDoDia retorna NS daquela data', async () => {
    await svc.create(
      {
        codigo: 'NS001',
        descricao: 'X',
        data: '2026-05-10',
        horaInicio: '08:00',
        horaFim: '12:00',
        militaresNfs: ['3037509'],
      },
      sargenteanteNf,
    );
    expect(await svc.listDoDia('2026-05-10')).toHaveLength(1);
    expect(await svc.listDoDia('2026-05-11')).toHaveLength(0);
  });

  it('update preserva id e criadoEm', async () => {
    const n = await svc.create(
      {
        codigo: 'NS001',
        descricao: 'X',
        data: '2026-05-10',
        horaInicio: '08:00',
        horaFim: '12:00',
        militaresNfs: ['3037509'],
      },
      sargenteanteNf,
    );
    const updated = await svc.update(n.id, {
      descricao: 'X — alterado',
      militaresNfs: ['3037509', '3670180'],
    });
    expect(updated.id).toBe(n.id);
    expect(updated.descricao).toBe('X — alterado');
    expect(updated.militaresNfs).toEqual(['3037509', '3670180']);
    expect(updated.codigo).toBe(n.codigo);
    expect(updated.criadoEm).toBe(n.criadoEm);
  });

  it('remove (soft delete) exclui da lista', async () => {
    const n = await svc.create(
      {
        codigo: 'NS001',
        descricao: 'X',
        data: '2026-05-10',
        horaInicio: '08:00',
        horaFim: '12:00',
        militaresNfs: ['3037509'],
      },
      sargenteanteNf,
    );
    await svc.remove(n.id);
    await expect(svc.findById(n.id)).rejects.toThrow(NotFoundException);
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import type { LocalFaxina as PrismaLocalFaxina } from '@prisma/client';
import { LocaisFaxinaService } from './locais-faxina.service';
import type { PrismaService } from '../../common/prisma/prisma.service';

function makePrismaMock(): PrismaService {
  const store = new Map<string, PrismaLocalFaxina>();
  let counter = 1;
  const localFaxina = {
    count: async () => store.size,
    findMany: async ({ orderBy }: { orderBy?: { ordem: 'asc' } } = {}) => {
      const arr = [...store.values()];
      if (orderBy?.ordem === 'asc') arr.sort((a, b) => a.ordem - b.ordem);
      return arr;
    },
    findUnique: async ({ where }: { where: { id: string } }) => store.get(where.id) ?? null,
    create: async ({ data }: { data: { nome: string; ordem?: number; ativo?: boolean } }) => {
      const id = `lf-${counter++}`;
      const now = new Date();
      const r: PrismaLocalFaxina = {
        id,
        nome: data.nome,
        ordem: data.ordem ?? 0,
        ativo: data.ativo ?? true,
        criadoEm: now,
        atualizadoEm: now,
      };
      store.set(id, r);
      return r;
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<PrismaLocalFaxina>;
    }) => {
      const cur = store.get(where.id);
      if (!cur) throw new Error(`No local ${where.id}`);
      const next = { ...cur, ...data, atualizadoEm: new Date() };
      store.set(where.id, next);
      return next;
    },
  };
  return { localFaxina } as unknown as PrismaService;
}

describe('LocaisFaxinaService', () => {
  let svc: LocaisFaxinaService;

  beforeEach(() => {
    svc = new LocaisFaxinaService(makePrismaMock());
    // Não chama onModuleInit — em NODE_ENV=test ele já sairia cedo.
  });

  it('create + list mantém ordem ascendente', async () => {
    await svc.create({ nome: 'COZINHA' });
    await svc.create({ nome: 'ALOJAMENTO' });
    const list = await svc.list();
    expect(list.map((l) => l.nome)).toEqual(['COZINHA', 'ALOJAMENTO']);
    expect(list[0]?.ordem).toBe(1);
    expect(list[1]?.ordem).toBe(2);
  });

  it('rejeita nome duplicado (case-insensitive)', async () => {
    await svc.create({ nome: 'COZINHA' });
    await expect(svc.create({ nome: 'cozinha' })).rejects.toThrow(ConflictException);
  });

  it('update altera nome + ordem + ativo', async () => {
    const l = await svc.create({ nome: 'COZINHA' });
    const updated = await svc.update(l.id, { nome: 'COZINHA NOVA', ordem: 99, ativo: false });
    expect(updated.nome).toBe('COZINHA NOVA');
    expect(updated.ordem).toBe(99);
    expect(updated.ativo).toBe(false);
  });

  it('softDelete marca ativo=false sem remover', async () => {
    const l = await svc.create({ nome: 'COZINHA' });
    await svc.softDelete(l.id);
    expect((await svc.findById(l.id)).ativo).toBe(false);
    expect((await svc.list()).length).toBe(1);
    expect((await svc.list({ ativosOnly: true })).length).toBe(0);
  });

  it('findById lança NotFound para id inexistente', async () => {
    await expect(svc.findById('inexistente')).rejects.toThrow(NotFoundException);
  });

  it('list({ ativosOnly: true }) filtra inativos', async () => {
    const a = await svc.create({ nome: 'A' });
    await svc.create({ nome: 'B' });
    await svc.softDelete(a.id);
    expect((await svc.list({ ativosOnly: true })).map((l) => l.nome)).toEqual(['B']);
  });
});

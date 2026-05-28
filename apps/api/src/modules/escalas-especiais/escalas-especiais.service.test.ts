import { describe, it, expect, beforeEach } from 'vitest';
import type { EscalaEspecialMensal } from '@argus/shared-types';
import type {
  EscalaEspecialAto as PrismaAto,
  EscalaEspecialMensal as PrismaMensal,
} from '@prisma/client';
import { EscalasEspeciaisService } from './escalas-especiais.service';
import type { PrismaService } from '../../common/prisma/prisma.service';

function fakeEscala(over: Partial<EscalaEspecialMensal> = {}): EscalaEspecialMensal {
  return {
    mes: 5,
    ano: 2026,
    origemArquivo: '05 - ESCALA ESPECIAL.xlsm',
    importadoEm: '2026-05-01T00:00:00Z',
    atos: [
      { data: '2026-05-01', militarRaw: 'SGT MARIANE', horario: '07:10 ÀS 13:10', funcao: 'APOIO' },
      { data: '2026-05-01', militarRaw: 'SGT BISSOLI', horario: '13:10 ÀS 19:10', funcao: 'APOIO' },
      { data: '2026-05-02', militarRaw: 'SD LOUREIRO', horario: '12:00 ÀS 18:00', funcao: 'APOIO' },
    ],
    avisos: [],
    ...over,
  };
}

/**
 * Mock in-memory de `prisma.escalaEspecialMensal.*` e `escalaEspecialAto.*`
 * com suporte a $transaction (callback recebe o próprio mock).
 */
function makePrismaMock(): PrismaService {
  const mesesById = new Map<string, PrismaMensal>();
  const atosByMesId = new Map<string, PrismaAto[]>();
  let counter = 1;

  const keyAnoMes = (ano: number, mes: number): string => `${ano}-${String(mes).padStart(2, '0')}`;

  const escalaEspecialMensal = {
    count: async () => mesesById.size,
    findUnique: async ({
      where,
      include,
    }: {
      where: { ano_mes: { ano: number; mes: number } };
      include?: { atos?: boolean };
    }) => {
      for (const m of mesesById.values()) {
        if (m.ano === where.ano_mes.ano && m.mes === where.ano_mes.mes) {
          return include?.atos
            ? ({ ...m, atos: atosByMesId.get(m.id) ?? [] } as PrismaMensal & {
                atos: PrismaAto[];
              })
            : m;
        }
      }
      return null;
    },
    findMany: async ({
      orderBy: _orderBy,
      include: _include,
    }: { orderBy?: unknown; include?: unknown } = {}) => {
      const arr = [...mesesById.values()].sort((a, b) => b.ano - a.ano || b.mes - a.mes);
      return arr.map((m) => ({
        ...m,
        _count: { atos: (atosByMesId.get(m.id) ?? []).length },
      }));
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
        avisos?: object;
        atos?: { create: Array<Omit<PrismaAto, 'id' | 'escalaEspecialId'>> };
      };
    }) => {
      const id = `esp-${counter++}`;
      const now = new Date();
      const m: PrismaMensal = {
        id,
        ano: data.ano,
        mes: data.mes,
        origemArquivo: data.origemArquivo,
        importadoEm: data.importadoEm,
        importadoPorNf: data.importadoPorNf ?? null,
        avisos: (data.avisos ?? null) as PrismaMensal['avisos'],
      };
      mesesById.set(id, m);
      const atos: PrismaAto[] = (data.atos?.create ?? []).map((a, i) => ({
        ...a,
        id: `${id}-ato-${i}`,
        escalaEspecialId: id,
      }));
      atosByMesId.set(id, atos);
      void now;
      return m;
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<PrismaMensal> & {
        atos?: { create: Array<Omit<PrismaAto, 'id' | 'escalaEspecialId'>> };
      };
    }) => {
      const m = mesesById.get(where.id);
      if (!m) throw new Error(`No esp ${where.id}`);
      const next: PrismaMensal = { ...m, ...data } as PrismaMensal;
      mesesById.set(where.id, next);
      if (data.atos?.create) {
        // S2.12c — diff seletivo: update.atos.create APENDA (não substitui).
        // deleteMany separado já cuidou dos atos a remover.
        const existentes = atosByMesId.get(where.id) ?? [];
        let nextId = existentes.length;
        const novosAtos: PrismaAto[] = data.atos.create.map((a) => ({
          ...a,
          id: `${where.id}-ato-${nextId++}`,
          escalaEspecialId: where.id,
        }));
        atosByMesId.set(where.id, [...existentes, ...novosAtos]);
      }
      return next;
    },
    delete: async ({ where }: { where: { ano_mes: { ano: number; mes: number } } }) => {
      for (const [id, m] of mesesById.entries()) {
        if (m.ano === where.ano_mes.ano && m.mes === where.ano_mes.mes) {
          mesesById.delete(id);
          atosByMesId.delete(id);
          return m;
        }
      }
      throw new Error('Not found');
    },
  };

  const escalaEspecialAto = {
    deleteMany: async ({
      where,
    }: {
      where: { escalaEspecialId?: string; id?: { in: string[] } };
    }) => {
      // S2.12c — diff seletivo passa `where: { id: { in: [...] } }`.
      if (where.id?.in) {
        const idsToDelete = new Set(where.id.in);
        let count = 0;
        for (const [mesId, atos] of atosByMesId.entries()) {
          const next = atos.filter((a) => !idsToDelete.has(a.id));
          count += atos.length - next.length;
          atosByMesId.set(mesId, next);
        }
        return { count };
      }
      // Backward-compat: delete inteiro por escalaEspecialId.
      if (where.escalaEspecialId) {
        atosByMesId.delete(where.escalaEspecialId);
      }
      return { count: 0 };
    },
    findMany: async ({
      where,
    }: {
      where: { data: string; escalaEspecial: { ano: number; mes: number } };
    }) => {
      const m = [...mesesById.values()].find(
        (x) => x.ano === where.escalaEspecial.ano && x.mes === where.escalaEspecial.mes,
      );
      if (!m) return [];
      return (atosByMesId.get(m.id) ?? []).filter((a) => a.data === where.data);
    },
  };

  const prismaLike = {
    escalaEspecialMensal,
    escalaEspecialAto,
    $transaction: async (cb: (tx: unknown) => Promise<unknown>) => cb(prismaLike),
  };
  void keyAnoMes;
  return prismaLike as unknown as PrismaService;
}

describe('EscalasEspeciaisService', () => {
  let service: EscalasEspeciaisService;
  beforeEach(() => {
    service = new EscalasEspeciaisService(makePrismaMock());
  });

  it('save + get', async () => {
    const e = fakeEscala();
    await service.save(e);
    const got = await service.get(2026, 5);
    expect(got?.ano).toBe(e.ano);
    expect(got?.mes).toBe(e.mes);
    expect(got?.atos).toHaveLength(3);
    expect(await service.get(2026, 4)).toBeNull();
  });

  it('list ordena por ano/mes desc', async () => {
    await service.save(fakeEscala({ ano: 2026, mes: 5 }));
    await service.save(fakeEscala({ ano: 2026, mes: 6 }));
    await service.save(fakeEscala({ ano: 2026, mes: 4 }));
    const r = (await service.list()).escalas;
    expect(r.map((x) => x.mes)).toEqual([6, 5, 4]);
    expect(r[0]?.totalAtos).toBe(3);
  });

  it('save sobrescreve por ano/mes', async () => {
    await service.save(fakeEscala({ origemArquivo: 'v1.xlsm' }));
    await service.save(fakeEscala({ origemArquivo: 'v2.xlsm' }));
    expect((await service.get(2026, 5))?.origemArquivo).toBe('v2.xlsm');
  });

  it('delete remove', async () => {
    await service.save(fakeEscala());
    expect(await service.delete(2026, 5)).toBe(true);
    expect(await service.get(2026, 5)).toBeNull();
  });

  it('getAtosDoDia filtra por data', async () => {
    await service.save(fakeEscala());
    expect(await service.getAtosDoDia(2026, 5, '2026-05-01')).toHaveLength(2);
    expect(await service.getAtosDoDia(2026, 5, '2026-05-02')).toHaveLength(1);
    expect(await service.getAtosDoDia(2026, 5, '2026-05-03')).toEqual([]);
    expect(await service.getAtosDoDia(2026, 4, '2026-04-01')).toEqual([]);
  });

  // S2.12c — diff seletivo: re-import preserva atos idênticos por
  // {data|militarRaw|horario|funcao}, adiciona novos, remove ausentes.
  it('S2.12c: re-import idêntico mantém todos os atos (zero diff)', async () => {
    await service.save(fakeEscala());
    await service.save(fakeEscala()); // mesma escala
    const got = await service.get(2026, 5);
    expect(got?.atos).toHaveLength(3);
  });

  it('S2.12c: re-import com 1 ato substituído remove o antigo e adiciona o novo', async () => {
    await service.save(fakeEscala());
    const novaVersao = fakeEscala({
      atos: [
        {
          data: '2026-05-01',
          militarRaw: 'SGT MARIANE',
          horario: '07:10 ÀS 13:10',
          funcao: 'APOIO',
        },
        // SGT BISSOLI substituído por CB FABRE
        { data: '2026-05-01', militarRaw: 'CB FABRE', horario: '13:10 ÀS 19:10', funcao: 'APOIO' },
        {
          data: '2026-05-02',
          militarRaw: 'SD LOUREIRO',
          horario: '12:00 ÀS 18:00',
          funcao: 'APOIO',
        },
      ],
    });
    await service.save(novaVersao);
    const got = await service.get(2026, 5);
    expect(got?.atos).toHaveLength(3);
    expect(got?.atos.find((a) => a.militarRaw === 'SGT BISSOLI')).toBeUndefined();
    expect(got?.atos.find((a) => a.militarRaw === 'CB FABRE')).toBeDefined();
  });

  it('S2.12c: re-import com ato adicional mantém os antigos + adiciona o novo', async () => {
    await service.save(fakeEscala());
    const expandida = fakeEscala({
      atos: [
        ...fakeEscala().atos,
        { data: '2026-05-03', militarRaw: 'CB FABRE', horario: '07:10 ÀS 13:10', funcao: 'APOIO' },
      ],
    });
    await service.save(expandida);
    const got = await service.get(2026, 5);
    expect(got?.atos).toHaveLength(4);
  });

  it('S2.12c: re-import com 1 ato removido apaga só o ato em questão (não os 2 restantes)', async () => {
    await service.save(fakeEscala());
    const reduzida = fakeEscala({
      atos: fakeEscala().atos.slice(0, 2), // só os 2 primeiros (do dia 01)
    });
    await service.save(reduzida);
    const got = await service.get(2026, 5);
    expect(got?.atos).toHaveLength(2);
    expect(got?.atos.every((a) => a.data === '2026-05-01')).toBe(true);
  });
});

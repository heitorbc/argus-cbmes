import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../common/prisma/prisma.service';
import { ChefesOperacoesImportService } from './chefes-operacoes-import.service';

const HEADER_ROW =
  ',Nº,ANT,POSTO,NOME DE GUERRA,TELEFONE,NF,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,EDOCs,FÉRIAS,U,F,S,TOTAL';

// 5 linhas de cabeçalho institucional + 1 header tokenizado + 2 linhas de dados.
function makeCsv(): string {
  const filler = Array.from({ length: 5 }, () => ',,,,,,').join('\n');
  const data1 =
    '1,1,100,CAP,BARCELLOS,(27) 99999-9999,3037509,X,,,,,,,,Y,,,,,,,,,,,,,,,,,,,,,,,,,,';
  const data2 = '2,2,200,1ºTEN,SILVA,(27) 88888-8888,9999999,,,,X,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,';
  return `${filler}\n${HEADER_ROW}\n${data1}\n${data2}\n`;
}

function makeConfig(): ConfigService {
  return {
    get: vi.fn(() => undefined),
  } as unknown as ConfigService;
}

function makePrismaMock(): PrismaService & {
  _rows: Array<{ nf: string; dia: number; marcador: string }>;
  _deleteCount: number;
} {
  let rows: Array<{
    nf: string;
    dia: number;
    marcador: string;
    posto: string;
    nomeGuerra: string;
    telefone: string | null;
  }> = [];
  let deleteCount = 0;

  const tx = {
    chefeOperacoesEscala: {
      deleteMany: async () => {
        deleteCount++;
        const n = rows.length;
        rows = [];
        return { count: n };
      },
      createMany: async ({ data }: { data: typeof rows }) => {
        rows.push(...data);
        return { count: data.length };
      },
    },
  };

  const prisma = {
    _rows: rows,
    _deleteCount: deleteCount,
    chefeOperacoesEscala: tx.chefeOperacoesEscala,
    $transaction: async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx),
  } as unknown as PrismaService & {
    _rows: Array<{ nf: string; dia: number; marcador: string }>;
    _deleteCount: number;
  };

  // Expor referência mutável
  Object.defineProperty(prisma, '_rows', {
    get: () => rows,
  });
  Object.defineProperty(prisma, '_deleteCount', {
    get: () => deleteCount,
  });

  return prisma;
}

describe('ChefesOperacoesImportService (S2.10.9a)', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let svc: ChefesOperacoesImportService;

  beforeEach(() => {
    prisma = makePrismaMock();
    svc = new ChefesOperacoesImportService(makeConfig(), prisma);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => makeCsv(),
      } as Response),
    );
  });

  it('replace-all: deleta tudo e re-cria a partir do CSV', async () => {
    const r = await svc.syncToDatabase();
    expect(r.created).toBe(3); // BARCELLOS dias 1+9 (X,Y) + SILVA dia 4 (X) = 3 entries
    expect(prisma._deleteCount).toBe(1);
    expect(prisma._rows.length).toBe(3);
    const bar = prisma._rows.filter((r) => r.nf === '3037509');
    expect(bar.length).toBe(2);
    expect(bar.map((r) => r.dia).sort((a, b) => a - b)).toEqual([1, 9]);
  });

  it('idempotência: 2 runs com mesmo CSV → estado final idêntico (replace-all)', async () => {
    await svc.syncToDatabase();
    const r2 = await svc.syncToDatabase();
    expect(r2.created).toBe(3);
    expect(prisma._deleteCount).toBe(2); // 2 syncs = 2 deletes
    expect(prisma._rows.length).toBe(3);
  });

  it('falha no fetch HTTP propaga ServiceUnavailableException via forceSync', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: async () => '',
      } as Response),
    );
    await expect(svc.forceSync()).rejects.toThrow(/sincronizar/i);
  });

  it('getSyncStatus retorna counts da última sync + flag stale=false (fresh)', async () => {
    expect(svc.getSyncStatus().syncedAt).toBeNull();
    await svc.syncToDatabase();
    const s = svc.getSyncStatus();
    expect(s.syncedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(s.counts?.created).toBe(3);
    expect(s.stale).toBe(false);
  });

  it('CSV vazio (0 militares) lança erro de formato', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => `${HEADER_ROW}\n`,
      } as Response),
    );
    await expect(svc.forceSync()).rejects.toThrow(/sincronizar/i);
  });
});

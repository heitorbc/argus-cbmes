import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../common/prisma/prisma.service';
import { ChefesOperacoesImportService } from './chefes-operacoes-import.service';

const HEADER_ROW =
  ',Nº,ANT,POSTO,NOME DE GUERRA,TELEFONE,NF,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,EDOCs,FÉRIAS,U,F,S,TOTAL';

/**
 * S2.10.11b — Multi-sheet: cada aba representa 1 mês. O fetch retorna o CSV
 * adequado conforme o nome da aba na URL. Geramos um CSV simples com 2
 * militares e marcadores conhecidos.
 */
function makeCsv(mesPorExtenso: string, ano: number): string {
  const headerInst = `${mesPorExtenso.toUpperCase()} DE ${ano},,,,,,`;
  const filler = Array.from({ length: 4 }, () => ',,,,,,').join('\n');
  const data1 =
    '1,1,100,CAP,BARCELLOS,(27) 99999-9999,3037509,X,,,,,,,,Y,,,,,,,,,,,,,,,,,,,,,,,,,,';
  const data2 = '2,2,200,1ºTEN,SILVA,(27) 88888-8888,9999999,,,,X,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,';
  return `${headerInst}\n${filler}\n${HEADER_ROW}\n${data1}\n${data2}\n`;
}

function makeConfig(opts: { sheetNames?: string; planilhaAno?: number } = {}): ConfigService {
  return {
    get: vi.fn((key: string) => {
      if (key === 'CHOP_SHEET_NAMES') return opts.sheetNames;
      if (key === 'CHOP_PLANILHA_ANO') {
        return opts.planilhaAno !== undefined ? String(opts.planilhaAno) : undefined;
      }
      return undefined;
    }),
  } as unknown as ConfigService;
}

interface Row {
  ano: number;
  mes: number;
  nf: string;
  dia: number;
  marcador: string;
  posto: string;
  nomeGuerra: string;
  telefone: string | null;
}

function makePrismaMock(): PrismaService & {
  _rows: Row[];
  _deletesByMes: Map<string, number>;
} {
  let rows: Row[] = [];
  const deletesByMes = new Map<string, number>();

  const tx = {
    chefeOperacoesEscala: {
      deleteMany: async ({ where }: { where: { ano: number; mes: number } }) => {
        const key = `${where.ano}-${where.mes}`;
        deletesByMes.set(key, (deletesByMes.get(key) ?? 0) + 1);
        const before = rows.length;
        rows = rows.filter((r) => !(r.ano === where.ano && r.mes === where.mes));
        return { count: before - rows.length };
      },
      createMany: async ({ data }: { data: Row[] }) => {
        rows.push(...data);
        return { count: data.length };
      },
      // S2.14 — findFirst usado por syncNextMonth para detectar último mês carregado
      findFirst: async (_args: unknown) => {
        if (rows.length === 0) return null;
        // Ordena desc por (ano, mes) e retorna o primeiro
        const sorted = [...rows].sort((a, b) => b.ano - a.ano || b.mes - a.mes);
        return { ano: sorted[0]!.ano, mes: sorted[0]!.mes };
      },
    },
  };

  const prisma = {
    chefeOperacoesEscala: {
      ...tx.chefeOperacoesEscala,
      // findFirst também disponível no nível do prisma (não só dentro de tx)
      findFirst: tx.chefeOperacoesEscala.findFirst,
    },
    $transaction: async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx),
  } as unknown as PrismaService & { _rows: Row[]; _deletesByMes: Map<string, number> };

  Object.defineProperty(prisma, '_rows', { get: () => rows });
  Object.defineProperty(prisma, '_deletesByMes', { get: () => deletesByMes });

  return prisma;
}

/**
 * Fetch stub que retorna CSV baseado na aba (`?sheet=NAME`) presente na URL.
 * Cada aba devolve um mês diferente.
 */
function makeFetchPerSheet(sheetMap: Record<string, string>) {
  return vi.fn(async (url: string) => {
    const m = url.match(/sheet=([^&]+)/);
    const name = m ? decodeURIComponent(m[1]!) : '';
    const csv = sheetMap[name];
    if (csv === undefined) {
      return { ok: false, status: 404, text: async () => '' } as Response;
    }
    return { ok: true, text: async () => csv } as Response;
  });
}

describe('ChefesOperacoesImportService — bulk (S2.10.11b / S2.14-fix abreviações)', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let svc: ChefesOperacoesImportService;

  beforeEach(() => {
    prisma = makePrismaMock();
    // S2.14-fix — planilha usa abreviações JAN, FEV, ... DEZ sem ano.
    // `CHOP_PLANILHA_ANO=2026` injeta o ano via hint no parser.
    svc = new ChefesOperacoesImportService(makeConfig({ planilhaAno: 2026 }), prisma);
    // Stub: apenas ABR e MAI disponíveis na planilha (resto retorna 404)
    vi.stubGlobal(
      'fetch',
      makeFetchPerSheet({
        ABR: makeCsv('ABRIL', 2026),
        MAI: makeCsv('MAIO', 2026),
      }),
    );
  });

  it('bulk importa apenas as abas disponíveis (ABR + MAI) em paralelo', async () => {
    const r = await svc.syncToDatabase();
    // 2 meses ok × 3 entries cada = 6; 10 meses faltando registrados em inconsistencias
    expect(r.created).toBe(6);
    expect(prisma._rows.length).toBe(6);
    expect(prisma._rows.filter((r) => r.mes === 4)).toHaveLength(3);
    expect(prisma._rows.filter((r) => r.mes === 5)).toHaveLength(3);
    expect(r.skipped).toBe(10);
    expect(r.inconsistencias.length).toBe(10);
  });

  it('cada mês importado tem deleteMany próprio (não derruba os outros)', async () => {
    await svc.syncToDatabase();
    expect(prisma._deletesByMes.get('2026-4')).toBe(1);
    expect(prisma._deletesByMes.get('2026-5')).toBe(1);
  });

  it('idempotência: 2 runs com mesmos CSVs → estado final idêntico', async () => {
    await svc.syncToDatabase();
    const r2 = await svc.syncToDatabase();
    expect(r2.created).toBe(6);
    expect(prisma._rows.length).toBe(6); // sem duplicação
    expect(prisma._deletesByMes.get('2026-4')).toBe(2);
    expect(prisma._deletesByMes.get('2026-5')).toBe(2);
  });

  it('falha em 1 aba (404) NÃO bloqueia as demais', async () => {
    vi.stubGlobal(
      'fetch',
      makeFetchPerSheet({
        // ABR ausente (404)
        MAI: makeCsv('MAIO', 2026),
      }),
    );
    const r = await svc.syncToDatabase();
    expect(r.inconsistencias.length).toBeGreaterThan(0);
    expect(r.inconsistencias.some((m) => m.includes('04/2026'))).toBe(true);
    // MAI foi importado mesmo assim
    expect(r.created).toBe(3);
    expect(prisma._rows.filter((r) => r.mes === 5)).toHaveLength(3);
  });

  it('getSyncStatus retorna counts da última sync', async () => {
    expect(svc.getSyncStatus().syncedAt).toBeNull();
    await svc.syncToDatabase();
    const s = svc.getSyncStatus();
    expect(s.syncedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(s.counts?.created).toBe(6);
  });

  it('todas as abas falharem (12 abas 404) → 0 created + 12 inconsistencias', async () => {
    vi.stubGlobal('fetch', makeFetchPerSheet({}));
    const r = await svc.forceSync();
    expect(r.created).toBe(0);
    expect(r.skipped).toBe(12);
    expect(r.inconsistencias.length).toBe(12);
  });
});

describe('ChefesOperacoesImportService — sync mês-a-mês (S2.14 / S2.14-fix abreviações)', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let svc: ChefesOperacoesImportService;

  beforeEach(() => {
    prisma = makePrismaMock();
    // S2.14-fix — planilha real usa abas JAN, FEV, MAR, ABR, MAI, ... sem ano.
    svc = new ChefesOperacoesImportService(makeConfig({ planilhaAno: 2026 }), prisma);
  });

  it('syncMonth(2026, 5) baixa apenas "MAI" e persiste (ano injetado via hint)', async () => {
    vi.stubGlobal(
      'fetch',
      makeFetchPerSheet({
        MAI: makeCsv('MAIO', 2026),
        // Outros meses NÃO devem ser chamados — confirmando single-sheet
      }),
    );
    const r = await svc.syncMonth(2026, 5);
    // BARCELLOS dias 1+9 (X,Y) + SILVA dia 4 (X) = 3 entries num único mês
    expect(r.created).toBe(3);
    expect(prisma._rows.length).toBe(3);
    expect(prisma._rows.every((row) => row.ano === 2026 && row.mes === 5)).toBe(true);
    // deleteMany rodou apenas para (2026, 5) — preserva outros meses se existirem
    expect(prisma._deletesByMes.get('2026-5')).toBe(1);
    expect(prisma._deletesByMes.size).toBe(1);
  });

  it('syncNextMonth com DB vazio → BadRequestException', async () => {
    vi.stubGlobal('fetch', makeFetchPerSheet({}));
    await expect(svc.syncNextMonth()).rejects.toThrow(/Carregamento inicial/i);
  });

  it('syncNextMonth quando último é MAI/2026 e JUN não existe → disponivel:false', async () => {
    // Popula MAIO/2026 primeiro
    vi.stubGlobal('fetch', makeFetchPerSheet({ MAI: makeCsv('MAIO', 2026) }));
    await svc.syncMonth(2026, 5);
    expect(prisma._rows.length).toBe(3);

    // Agora tenta próximo (JUN) — fetch retorna 404
    vi.stubGlobal('fetch', makeFetchPerSheet({}));
    const r = await svc.syncNextMonth();
    expect('disponivel' in r ? r.disponivel : true).toBe(false);
    expect('mensagem' in r ? r.mensagem : '').toMatch(/JUN/);
    // DB não foi alterado pela tentativa
    expect(prisma._rows.length).toBe(3);
  });

  it('syncNextMonth: rollover DEZ/2026 → tenta JAN/2027 (ano injetado via hint)', async () => {
    // Popula DEZEMBRO/2026
    vi.stubGlobal('fetch', makeFetchPerSheet({ DEZ: makeCsv('DEZEMBRO', 2026) }));
    await svc.syncMonth(2026, 12);
    expect(prisma._rows[0]?.mes).toBe(12);

    // Janeiro/2027 disponível na planilha (mesma aba JAN, ano 2027 injetado)
    vi.stubGlobal('fetch', makeFetchPerSheet({ JAN: makeCsv('JANEIRO', 2027) }));
    const r = await svc.syncNextMonth();
    expect('ano' in r ? r.ano : null).toBe(2027);
    expect('mes' in r ? r.mes : null).toBe(1);
    // DB agora tem ambos meses
    expect(prisma._rows.filter((row) => row.ano === 2026 && row.mes === 12).length).toBe(3);
    expect(prisma._rows.filter((row) => row.ano === 2027 && row.mes === 1).length).toBe(3);
  });
});

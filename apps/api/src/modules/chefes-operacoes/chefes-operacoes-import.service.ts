import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { parseAnoMesFromSheetName, parseChefesOperacoesCsv } from './chefes-operacoes-csv-parser';

const CACHE_TTL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15_000;

const DEFAULT_SHEET_ID = '1Nlr_uSNVD6dByaWPTL6IttSOa2nQPXO-m7FqTpeH8WI';

/**
 * S2.10.11b — Lista padrão de abas conhecidas. Override via env
 * `CHOP_SHEET_NAMES` (CSV separado por vírgula).
 */
const DEFAULT_SHEET_NAMES = [
  'JANEIRO 2026',
  'FEVEREIRO 2026',
  'MARÇO 2026',
  'ABRIL 2026',
  'MAIO 2026',
  'JUNHO 2026',
  'JULHO 2026',
  'AGOSTO 2026',
  'SETEMBRO 2026',
  'OUTUBRO 2026',
  'NOVEMBRO 2026',
  'DEZEMBRO 2026',
];

/**
 * S2.14 — Nomes dos meses em PT-BR uppercase usados para resolver
 * `(ano, mes) → "NOME ANO"` (formato das abas da planilha).
 */
const MESES_PT_UPPER = [
  'JANEIRO',
  'FEVEREIRO',
  'MARÇO',
  'ABRIL',
  'MAIO',
  'JUNHO',
  'JULHO',
  'AGOSTO',
  'SETEMBRO',
  'OUTUBRO',
  'NOVEMBRO',
  'DEZEMBRO',
];

export interface SyncResult {
  created: number;
  updated: number;
  skipped: number;
  inconsistencias: string[];
  syncedAt: string;
}

/**
 * S2.10.11b — Importa todas as abas mensais da planilha "Escala de Chefe de
 * Operações" e persiste em `prisma.chefeOperacoesEscala`. Cada aba representa
 * 1 mês; oficiais de toda a instituição (não só 1ª Cia) podem aparecer.
 *
 * Padrão multi-sheet: itera `sheetNames()` (env-driven), faz fetch de cada
 * aba em paralelo, agrega o resultado num único SyncLog. Falha em 1 aba NÃO
 * bloqueia as demais (graceful degradation — pattern do ISEO em S2.10.8c).
 *
 * Idempotência: `deleteMany({ano, mes})` + `createMany` por aba (cada mês
 * é substituído inteiro). Dados de outros meses ficam intactos.
 */
@Injectable()
export class ChefesOperacoesImportService {
  readonly id = 'chefes-operacoes-import';
  readonly nome = 'Chefes de Operações → Postgres (multi-mês)';

  private readonly logger = new Logger(ChefesOperacoesImportService.name);
  private lastSync: SyncResult | null = null;
  private lastSyncAtMs: number | null = null;
  private inflight: Promise<SyncResult> | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  getSyncStatus(): {
    syncedAt: string | null;
    counts: Pick<SyncResult, 'created' | 'updated' | 'skipped'> | null;
    stale: boolean;
    inconsistencias: number;
  } {
    if (!this.lastSync || this.lastSyncAtMs === null) {
      return { syncedAt: null, counts: null, stale: false, inconsistencias: 0 };
    }
    return {
      syncedAt: this.lastSync.syncedAt,
      counts: {
        created: this.lastSync.created,
        updated: this.lastSync.updated,
        skipped: this.lastSync.skipped,
      },
      stale: Date.now() - this.lastSyncAtMs >= CACHE_TTL_MS,
      inconsistencias: this.lastSync.inconsistencias.length,
    };
  }

  async forceSync(): Promise<SyncResult> {
    try {
      return await this.syncToDatabase();
    } catch (err) {
      this.logger.error(`forceSync ChOp falhou: ${(err as Error).message}`);
      throw new ServiceUnavailableException(
        'Não foi possível sincronizar com a planilha de Chefes de Operações.',
      );
    }
  }

  /**
   * S2.14 — Sincroniza apenas 1 mês da planilha (vs. `forceSync()` que
   * sincroniza todas as 12 abas). Operação rápida e idempotente:
   *   1. Resolve nome da aba via `monthSheetName(ano, mes)`
   *   2. Reusa `fetchAndParse(sheet)` (single-sheet)
   *   3. Substitui o mês inteiro em transaction (delete + insert)
   *
   * Propaga erro descritivo se a aba não existir ou o parser falhar.
   * Atualiza `lastSync` / `lastSyncAtMs` com o resultado.
   */
  async syncMonth(ano: number, mes: number): Promise<SyncResult> {
    const sheet = this.monthSheetName(ano, mes);
    const inconsistencias: string[] = [];
    let created = 0;
    let skipped = 0;

    let parsed: Awaited<ReturnType<ChefesOperacoesImportService['fetchAndParse']>>;
    try {
      parsed = await this.fetchAndParse(sheet);
    } catch (err) {
      const msg = `Aba "${sheet}" falhou: ${(err as Error).message}`;
      this.logger.warn(`ChOp syncMonth: ${msg}`);
      throw new ServiceUnavailableException(msg);
    }

    // Sanity check: ano/mes do parse devem bater com o solicitado (se não bater,
    // a aba foi renomeada ou o header está inconsistente — recusa em vez de
    // sobrescrever o mês errado).
    if (parsed.ano !== ano || parsed.mes !== mes) {
      throw new ServiceUnavailableException(
        `Aba "${sheet}" devolveu ${String(parsed.mes).padStart(2, '0')}/${parsed.ano}, ` +
          `esperado ${String(mes).padStart(2, '0')}/${ano}. Verifique nome da aba e cabeçalho.`,
      );
    }

    const rows: Array<{
      ano: number;
      mes: number;
      nf: string;
      dia: number;
      marcador: string;
      posto: string;
      nomeGuerra: string;
      telefone: string | null;
    }> = [];
    for (const m of parsed.militares) {
      for (const [dia, marcador] of m.porDia) {
        rows.push({
          ano,
          mes,
          nf: m.nf,
          dia,
          marcador,
          posto: m.posto,
          nomeGuerra: m.nomeGuerra,
          telefone: m.telefone ?? null,
        });
      }
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.chefeOperacoesEscala.deleteMany({ where: { ano, mes } });
        if (rows.length > 0) {
          const r2 = await tx.chefeOperacoesEscala.createMany({
            data: rows,
            skipDuplicates: true,
          });
          created = r2.count;
        }
      });
    } catch (err) {
      skipped = 1;
      const msg = `Persist ${String(mes).padStart(2, '0')}/${ano} falhou: ${(err as Error).message}`;
      this.logger.warn(`ChOp syncMonth: ${msg}`);
      inconsistencias.push(msg);
    }

    const result: SyncResult = {
      created,
      updated: 0,
      skipped,
      inconsistencias,
      syncedAt: new Date().toISOString(),
    };
    this.lastSync = result;
    this.lastSyncAtMs = Date.now();
    this.logger.log(
      `ChOp syncMonth ${String(mes).padStart(2, '0')}/${ano}: created=${created}, falhas=${inconsistencias.length}`,
    );
    return result;
  }

  /**
   * S2.14 — Busca a aba do mês seguinte ao último carregado e tenta importá-la.
   *
   * Comportamento:
   *   - Se DB está vazio → BadRequestException (admin deve usar carga inicial)
   *   - Se aba existe e parser sucede → retorna `{ ano, mes, result }`
   *   - Se aba não existe (HTTP 4xx ou cabeçalho ausente) → retorna
   *     `{ disponivel: false, mensagem: '...' }` sem mexer no DB
   *   - Demais erros (rede, timeout, persist) → propaga
   */
  async syncNextMonth(): Promise<
    { ano: number; mes: number; result: SyncResult } | { disponivel: false; mensagem: string }
  > {
    const ultimo = await this.prisma.chefeOperacoesEscala.findFirst({
      orderBy: [{ ano: 'desc' }, { mes: 'desc' }],
      select: { ano: true, mes: true },
    });
    if (!ultimo) {
      throw new BadRequestException(
        'DB sem dados de ChOp. Use "Carregamento inicial" antes de "Buscar próximo mês".',
      );
    }
    const proximoMes = ultimo.mes === 12 ? 1 : ultimo.mes + 1;
    const proximoAno = ultimo.mes === 12 ? ultimo.ano + 1 : ultimo.ano;
    const sheet = this.monthSheetName(proximoAno, proximoMes);

    try {
      const result = await this.syncMonth(proximoAno, proximoMes);
      return { ano: proximoAno, mes: proximoMes, result };
    } catch (err) {
      const msg = (err as Error).message ?? '';
      // Detecta aba ausente: HTTP 404 ou erro do parser indicando ausência de cabeçalho
      const ehAbaAusente =
        /HTTP\s+404/i.test(msg) ||
        /Cabeçalho.*não\s+encontrado/i.test(msg) ||
        /Não\s+foi\s+possível\s+determinar\s+ano\/mes/i.test(msg);
      if (ehAbaAusente) {
        return {
          disponivel: false,
          mensagem: `Próximo mês não disponível na planilha (aba "${sheet}" ausente).`,
        };
      }
      throw err;
    }
  }

  /**
   * S2.14 — Resolve `(ano, mes) → nome da aba` (ex.: `(2026, 5) → "MAIO 2026"`).
   *
   * Estratégia:
   *   1. Se `CHOP_SHEET_NAMES` está setado, procura match por (ano, mes) entre
   *      as entradas via `parseAnoMesFromSheetName` (suporta nomes customizados)
   *   2. Senão usa `MESES_PT_UPPER[mes-1] + ' ' + ano` (padrão default)
   *
   * Mês fora de [1..12] lança erro.
   */
  private monthSheetName(ano: number, mes: number): string {
    if (mes < 1 || mes > 12) {
      throw new BadRequestException(`mes inválido: ${mes} (esperado 1..12)`);
    }
    const raw = this.config.get<string>('CHOP_SHEET_NAMES');
    if (raw && raw.trim()) {
      const nomes = raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const match = nomes.find((n) => {
        const r = parseAnoMesFromSheetName(n);
        return r?.ano === ano && r?.mes === mes;
      });
      if (match) return match;
      // Fallback: nome custom não cobre esse mês → usa padrão default.
      this.logger.warn(
        `CHOP_SHEET_NAMES override não contém aba para ${String(mes).padStart(2, '0')}/${ano} — usando nome default.`,
      );
    }
    return `${MESES_PT_UPPER[mes - 1]} ${ano}`;
  }

  async syncToDatabase(): Promise<SyncResult> {
    if (this.inflight) return this.inflight;
    this.inflight = this.executeSyncToDatabase().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async executeSyncToDatabase(): Promise<SyncResult> {
    const sheets = this.sheetNames();
    const inconsistencias: string[] = [];

    // Fetch + parse em paralelo (cada aba pode falhar independentemente)
    const results = await Promise.all(
      sheets.map(async (sheet) => {
        try {
          const { ano, mes, militares } = await this.fetchAndParse(sheet);
          return { sheet, ano, mes, militares, err: null as Error | null };
        } catch (err) {
          const msg = `Aba "${sheet}" falhou: ${(err as Error).message}`;
          this.logger.warn(`ChOp sync: ${msg}`);
          inconsistencias.push(msg);
          return { sheet, ano: 0, mes: 0, militares: [], err: err as Error };
        }
      }),
    );

    let created = 0;
    let skipped = 0;

    for (const r of results) {
      if (r.err || !r.ano || !r.mes) {
        skipped++;
        continue;
      }
      const { ano, mes, militares } = r;
      // Monta as rows para este mês.
      const rows: Array<{
        ano: number;
        mes: number;
        nf: string;
        dia: number;
        marcador: string;
        posto: string;
        nomeGuerra: string;
        telefone: string | null;
      }> = [];
      for (const m of militares) {
        for (const [dia, marcador] of m.porDia) {
          rows.push({
            ano,
            mes,
            nf: m.nf,
            dia,
            marcador,
            posto: m.posto,
            nomeGuerra: m.nomeGuerra,
            telefone: m.telefone ?? null,
          });
        }
      }

      // Transaction por mês: delete tudo do (ano, mes) + insert novo.
      // Falha em 1 mês não afeta os demais (try/catch externo).
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.chefeOperacoesEscala.deleteMany({ where: { ano, mes } });
          if (rows.length > 0) {
            const r2 = await tx.chefeOperacoesEscala.createMany({
              data: rows,
              skipDuplicates: true,
            });
            created += r2.count;
          }
        });
      } catch (err) {
        skipped++;
        const msg = `Persist ${String(mes).padStart(2, '0')}/${ano} falhou: ${(err as Error).message}`;
        this.logger.warn(`ChOp sync: ${msg}`);
        inconsistencias.push(msg);
      }
    }

    const result: SyncResult = {
      created,
      updated: 0, // replace per mês
      skipped,
      inconsistencias,
      syncedAt: new Date().toISOString(),
    };
    this.lastSync = result;
    this.lastSyncAtMs = Date.now();
    this.logger.log(
      `ChOp sync OK: created=${created}, abas=${sheets.length}, falhas=${inconsistencias.length}`,
    );
    return result;
  }

  private sheetNames(): string[] {
    const raw = this.config.get<string>('CHOP_SHEET_NAMES');
    if (raw && raw.trim()) {
      return raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return DEFAULT_SHEET_NAMES;
  }

  private async fetchAndParse(sheet: string) {
    const sheetId = this.config.get<string>('CHOP_SHEET_ID') ?? DEFAULT_SHEET_ID;
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(
      sheet,
    )}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ao baixar ChOp "${sheet}"`);
      }
      const csv = await res.text();
      const fromSheetName = parseAnoMesFromSheetName(sheet);
      const parsed = parseChefesOperacoesCsv(csv, {
        defaultAno: fromSheetName?.ano,
        defaultMes: fromSheetName?.mes,
      });
      return parsed;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

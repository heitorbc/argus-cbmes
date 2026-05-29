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
 * S2.10.11b / S2.14-fix — Mapeamento `mes → abreviação` da aba. A planilha
 * institucional usa abreviações de 3 letras SEM ano (JAN, FEV, MAR, ABR,
 * MAI, JUN, JUL, AGO, SET, OUT, NOV, DEZ). O ano vem do contexto da
 * planilha (env `CHOP_PLANILHA_ANO`, default ano corrente) e é injetado
 * no parser via hint em `fetchAndParse`.
 *
 * Override completo via env `CHOP_SHEET_NAMES` (CSV de 12 entradas; usado
 * por `monthSheetName` quando a planilha tem naming não-padrão).
 */
const MESES_ABBR = [
  'JAN',
  'FEV',
  'MAR',
  'ABR',
  'MAI',
  'JUN',
  'JUL',
  'AGO',
  'SET',
  'OUT',
  'NOV',
  'DEZ',
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
      // S2.14-fix — passa ano/mes como hint para o parser: a planilha real
      // tem abas com nomes "JAN", "FEV", ... sem ano, e os headers internos
      // também não carregam ano explícito.
      parsed = await this.fetchAndParse(sheet, { ano, mes });
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
   * S2.14 / S2.14-fix — Resolve `(ano, mes) → nome da aba` (ex.: `(2026, 5) → "MAI"`).
   *
   * A planilha institucional usa abreviações de 3 letras SEM ano. O ano vem do
   * contexto da planilha como um todo (env `CHOP_PLANILHA_ANO` ou ano corrente);
   * fica registrado no parser via `defaultAno`.
   *
   * Estratégia:
   *   1. Se `CHOP_SHEET_NAMES` está setado e tem 12 entradas, usa a entrada
   *      na posição `mes - 1` (override completo, mantém ordem fixa)
   *   2. Senão usa `MESES_ABBR[mes-1]` (padrão default)
   *
   * Mês fora de [1..12] lança erro.
   */
  private monthSheetName(ano: number, mes: number): string {
    if (mes < 1 || mes > 12) {
      throw new BadRequestException(`mes inválido: ${mes} (esperado 1..12)`);
    }
    void ano; // ano vai para o parser via defaultAno, não para o nome da aba
    const raw = this.config.get<string>('CHOP_SHEET_NAMES');
    if (raw && raw.trim()) {
      const nomes = raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (nomes.length === 12) {
        return nomes[mes - 1]!;
      }
      this.logger.warn(
        `CHOP_SHEET_NAMES override deve ter exatamente 12 entradas (encontrado ${nomes.length}) — usando nome default.`,
      );
    }
    return MESES_ABBR[mes - 1]!;
  }

  /**
   * S2.14-fix — Ano padrão da planilha (usado quando o cabeçalho da aba não
   * carrega ano explícito, como na planilha real da ChOp que tem abas só com
   * abreviação do mês). Override via env `CHOP_PLANILHA_ANO`; default = ano corrente.
   */
  private getPlanilhaAno(): number {
    const raw = this.config.get<string>('CHOP_PLANILHA_ANO');
    if (raw) {
      const n = Number.parseInt(raw, 10);
      if (Number.isFinite(n) && n >= 2020 && n <= 2099) return n;
    }
    return new Date().getFullYear();
  }

  async syncToDatabase(): Promise<SyncResult> {
    if (this.inflight) return this.inflight;
    this.inflight = this.executeSyncToDatabase().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async executeSyncToDatabase(): Promise<SyncResult> {
    // S2.14-fix — Bulk passa a iterar (ano, mes) explicitamente (1..12) em
    // vez de iterar sheet names. Isso permite injetar o ano da planilha como
    // hint do parser (abas com abreviação "JAN", "FEV", ... sem ano).
    const planilhaAno = this.getPlanilhaAno();
    const inconsistencias: string[] = [];
    let created = 0;
    let skipped = 0;

    // Fetch + parse + persist em paralelo (cada mês independente)
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) => i + 1).map(async (mes) => {
        try {
          const r = await this.syncSingleMonthInternal(planilhaAno, mes);
          return { ok: true as const, mes, created: r.created, inconsistencias: r.inconsistencias };
        } catch (err) {
          const msg = `Mês ${String(mes).padStart(2, '0')}/${planilhaAno} falhou: ${(err as Error).message}`;
          this.logger.warn(`ChOp sync: ${msg}`);
          return { ok: false as const, mes, error: msg };
        }
      }),
    );

    for (const r of results) {
      if (!r.ok) {
        skipped++;
        inconsistencias.push(r.error);
        continue;
      }
      created += r.created;
      inconsistencias.push(...r.inconsistencias);
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
      `ChOp sync OK: created=${created}, abas=12 (${planilhaAno}), falhas=${inconsistencias.length}, skipped=${skipped}`,
    );
    return result;
  }

  /**
   * S2.14-fix — Mesma lógica do `syncMonth` público mas SEM atualizar
   * `lastSync` (cabe ao bulk agregar o resultado total). Lança em caso de
   * fetch/parse falhar — caller registra como skip.
   */
  private async syncSingleMonthInternal(
    ano: number,
    mes: number,
  ): Promise<{ created: number; inconsistencias: string[] }> {
    const sheet = this.monthSheetName(ano, mes);
    const inconsistencias: string[] = [];
    let created = 0;

    const parsed = await this.fetchAndParse(sheet, { ano, mes });
    if (parsed.ano !== ano || parsed.mes !== mes) {
      throw new Error(
        `Aba "${sheet}" devolveu ${String(parsed.mes).padStart(2, '0')}/${parsed.ano}, ` +
          `esperado ${String(mes).padStart(2, '0')}/${ano}.`,
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
      const msg = `Persist ${String(mes).padStart(2, '0')}/${ano} falhou: ${(err as Error).message}`;
      this.logger.warn(`ChOp sync: ${msg}`);
      inconsistencias.push(msg);
    }
    return { created, inconsistencias };
  }

  /**
   * S2.14-fix — Aceita `hint` opcional para injetar ano/mes no parser quando
   * o nome da aba não contém essas info (caso da planilha real da ChOp que
   * usa abreviações "JAN", "FEV", etc. sem ano).
   */
  private async fetchAndParse(sheet: string, hint?: { ano?: number; mes?: number }) {
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
        defaultAno: hint?.ano ?? fromSheetName?.ano,
        defaultMes: hint?.mes ?? fromSheetName?.mes,
      });
      return parsed;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

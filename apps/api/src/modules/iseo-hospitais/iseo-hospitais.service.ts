import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  IseoHospitalEntry,
  IseoHospitalSyncStatus,
  IseoHospitalUnidade,
} from '@argus/shared-types';
import {
  parseIseoHospitaisCsv,
  parseUnidadeFromSheetName,
} from './iseo-hospitais-csv-parser';

const CACHE_TTL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15_000;

const DEFAULT_SHEET_ID = '1wmFOEsrU219fGMfksoSY5dvQu0UN7HdQ558UUiWRXuw';

/**
 * Lista padrão de abas conhecidas (estado em 2026-05). Pode ser sobrescrita
 * via env `ISEO_SHEET_NAMES` (CSV separado por vírgula). Quando a planilha
 * ganhar novos meses, basta atualizar a env (ou esta lista).
 *
 * Aba `HIMABA DEZEMBRO 2025` é legacy (estrutura diferente, sem TURNO/FUNÇÃO)
 * e está fora do default. Para incluir histórico de 2025, sobrescreva via env.
 */
const DEFAULT_SHEET_NAMES = [
  'HPM JANEIRO 2026',
  'HIMABA JANEIRO 2026',
  'HPM FEVEREIRO 2026',
  'HIMABA FEVEREIRO 2026',
  'HPM MARÇO 2026',
  'HIMABA MARÇO 2026',
  'ABRIL 2026',
  'MAIO 2026',
];

interface CacheEntry {
  parsed: IseoHospitalEntry[];
  syncedAt: number;
}

/**
 * Lê a planilha "Escala ISEO Hospitais" via CSV público (`gviz/tq?sheet=`).
 * Cada aba representa um período (mês ou mês×unidade). O service combina
 * todas as abas configuradas e dedupa entries.
 *
 * Configurável via env:
 *   `ISEO_HOSPITAIS_SHEET_ID` (default acima)
 *   `ISEO_SHEET_NAMES` (CSV — default lista conhecida)
 */
@Injectable()
export class IseoHospitaisService {
  private readonly logger = new Logger(IseoHospitaisService.name);
  private readonly cache = new Map<string, CacheEntry>();
  private readonly inflight = new Map<string, Promise<CacheEntry>>();

  constructor(private readonly config: ConfigService) {}

  /** Lista deduplicada de todos os registros (todas as abas combinadas). */
  async list(): Promise<IseoHospitalEntry[]> {
    const all: IseoHospitalEntry[] = [];
    const results = await Promise.all(
      this.sheetNames().map(async (sheet) => {
        try {
          const { entry } = await this.getEntry(sheet);
          return entry.parsed;
        } catch (err) {
          this.logger.warn(`ISEO: falha em "${sheet}": ${(err as Error).message}. Pulando.`);
          return [] as IseoHospitalEntry[];
        }
      }),
    );
    for (const arr of results) all.push(...arr);
    return dedupe(all);
  }

  async listByUnidade(unidade: IseoHospitalUnidade): Promise<IseoHospitalEntry[]> {
    const all = await this.list();
    return all.filter((e) => e.unidade === unidade);
  }

  async listDoDia(dataIso: string): Promise<IseoHospitalEntry[]> {
    const all = await this.list();
    return all.filter((e) => e.dataIso === dataIso);
  }

  async listByMilitar(nf: string): Promise<IseoHospitalEntry[]> {
    const all = await this.list();
    return all.filter((e) => e.nf === nf);
  }

  /** Status por aba — usado em `/configuracoes/integracoes`. */
  getSyncStatus(): IseoHospitalSyncStatus[] {
    const out: IseoHospitalSyncStatus[] = [];
    for (const sheet of this.sheetNames()) {
      const c = this.cache.get(sheet);
      const unidade = parseUnidadeFromSheetName(sheet) ?? 'HPM';
      if (!c) {
        out.push({ unidade, syncedAt: null, count: 0, stale: false });
        continue;
      }
      out.push({
        unidade,
        syncedAt: new Date(c.syncedAt).toISOString(),
        count: c.parsed.length,
        stale: Date.now() - c.syncedAt >= CACHE_TTL_MS,
      });
    }
    return out;
  }

  async forceSync(): Promise<IseoHospitalSyncStatus[]> {
    for (const sheet of this.sheetNames()) {
      try {
        const entry = await this.fetchAndParse(sheet);
        this.cache.set(sheet, entry);
      } catch (err) {
        this.logger.error(`forceSync ISEO "${sheet}" falhou: ${(err as Error).message}.`);
      }
    }
    return this.getSyncStatus();
  }

  private sheetNames(): string[] {
    const raw = this.config.get<string>('ISEO_SHEET_NAMES');
    if (raw && raw.trim()) {
      return raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return DEFAULT_SHEET_NAMES;
  }

  private async getEntry(
    sheet: string,
  ): Promise<{ entry: CacheEntry; stale: boolean }> {
    const now = Date.now();
    const cached = this.cache.get(sheet);
    if (cached && now - cached.syncedAt < CACHE_TTL_MS) {
      return { entry: cached, stale: false };
    }
    const existing = this.inflight.get(sheet);
    if (existing) {
      const entry = await existing;
      return { entry, stale: false };
    }
    const promise = this.fetchAndParse(sheet).finally(() => {
      this.inflight.delete(sheet);
    });
    this.inflight.set(sheet, promise);
    try {
      const entry = await promise;
      this.cache.set(sheet, entry);
      return { entry, stale: false };
    } catch (err) {
      this.logger.error(
        `Falha ao sincronizar ISEO "${sheet}": ${(err as Error).message}. ${
          cached ? 'Servindo último snapshot.' : 'Sem snapshot anterior.'
        }`,
      );
      if (cached) return { entry: cached, stale: true };
      throw new ServiceUnavailableException(
        `Não foi possível sincronizar a aba ISEO Hospitais "${sheet}".`,
      );
    }
  }

  private async fetchAndParse(sheet: string): Promise<CacheEntry> {
    const sheetId = this.config.get<string>('ISEO_HOSPITAIS_SHEET_ID') ?? DEFAULT_SHEET_ID;
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(
      sheet,
    )}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let csv: string;
    try {
      const res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
      if (!res.ok) throw new Error(`HTTP ${res.status} ao baixar ISEO "${sheet}"`);
      csv = await res.text();
    } finally {
      clearTimeout(timeoutId);
    }

    const unidadeFromSheet = parseUnidadeFromSheetName(sheet);
    // Abas unificadas (ABRIL/MAIO 2026 em diante) não têm coluna OBM nem
    // prefixo de unidade no nome. Por convenção institucional, marcamos
    // como HPM (escala principal). Se a planilha futuramente discriminar
    // via OBM, o `inferUnidadeFromObm` ganha precedência.
    const parsed = parseIseoHospitaisCsv(csv, {
      unidadeFromSheet,
      unidadeDefault: unidadeFromSheet ? undefined : 'HPM',
    });
    return { parsed, syncedAt: Date.now() };
  }
}

/**
 * Dedupa entries por (unidade, dataIso, turno, nf). Necessário porque
 * abas duplicadas/repetidas podem produzir o mesmo registro mais de uma vez.
 */
function dedupe(entries: IseoHospitalEntry[]): IseoHospitalEntry[] {
  const seen = new Set<string>();
  const out: IseoHospitalEntry[] = [];
  for (const e of entries) {
    const key = `${e.unidade}|${e.dataIso}|${e.turno}|${e.nf}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

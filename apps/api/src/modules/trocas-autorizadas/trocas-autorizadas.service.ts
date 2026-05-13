import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TrocaAutorizada } from '@argus/shared-types';
import { parseTrocasAutorizadasCsv, trocasNoData } from './trocas-autorizadas-csv-parser';

const CACHE_TTL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15_000;

interface CacheEntry {
  parsed: TrocaAutorizada[];
  syncedAt: number;
}

/**
 * Item 1 — Trocas Autorizadas (planilha externa).
 *
 * Mesmo padrão de `ChefesOperacoesService` (cache TTL 5min + lock inflight
 * + fallback stale).
 *
 * Configurável via env: `TROCAS_AUT_SHEET_ID` e `TROCAS_AUT_SHEET_GID`.
 * Defaults apontam para a planilha institucional informada pelo Tech Lead.
 */
@Injectable()
export class TrocasAutorizadasService {
  private readonly logger = new Logger(TrocasAutorizadasService.name);
  private cache: CacheEntry | null = null;
  private inflight: Promise<CacheEntry> | null = null;

  constructor(private readonly config: ConfigService) {}

  async listAll(): Promise<TrocaAutorizada[]> {
    const { entry } = await this.getEntry();
    return entry.parsed;
  }

  async listByData(dataIso: string): Promise<TrocaAutorizada[]> {
    const { entry } = await this.getEntry();
    return trocasNoData(entry.parsed, dataIso);
  }

  /** Útil em tests. */
  reset(): void {
    this.cache = null;
    this.inflight = null;
  }

  /** S0.5/PR2 — metadados para a página /configuracoes/integracoes. */
  getSyncStatus(): { syncedAt: string | null; count: number; stale: boolean } {
    if (!this.cache) return { syncedAt: null, count: 0, stale: false };
    const stale = Date.now() - this.cache.syncedAt >= CACHE_TTL_MS;
    return {
      syncedAt: new Date(this.cache.syncedAt).toISOString(),
      count: this.cache.parsed.length,
      stale,
    };
  }

  private async getEntry(): Promise<{ entry: CacheEntry; stale: boolean }> {
    const now = Date.now();
    if (this.cache && now - this.cache.syncedAt < CACHE_TTL_MS) {
      return { entry: this.cache, stale: false };
    }
    if (this.inflight) {
      const entry = await this.inflight;
      return { entry, stale: false };
    }
    this.inflight = this.fetchAndParse().finally(() => {
      this.inflight = null;
    });
    try {
      const entry = await this.inflight;
      this.cache = entry;
      return { entry, stale: false };
    } catch (err) {
      this.logger.error(
        `Falha ao sincronizar Trocas Autorizadas: ${(err as Error).message}. ${this.cache ? 'Servindo último snapshot.' : 'Sem snapshot anterior.'}`,
      );
      if (this.cache) return { entry: this.cache, stale: true };
      throw new ServiceUnavailableException(
        'Não foi possível sincronizar com a planilha de Trocas Autorizadas e não há snapshot anterior.',
      );
    }
  }

  private async fetchAndParse(): Promise<CacheEntry> {
    const sheetId =
      this.config.get<string>('TROCAS_AUT_SHEET_ID') ??
      '1IjD4XskscfL5w4bCw5lP5qTNIZi5307XJKc3yGWK4D8';
    const gid = this.config.get<string>('TROCAS_AUT_SHEET_GID') ?? '1799360305';
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let csv: string;
    try {
      const res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
      if (!res.ok) throw new Error(`HTTP ${res.status} ao baixar Trocas Autorizadas`);
      csv = await res.text();
    } finally {
      clearTimeout(timeoutId);
    }

    const parsed = parseTrocasAutorizadasCsv(csv);
    return { parsed, syncedAt: Date.now() };
  }
}

import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ContatoLogistico, ViaturaCbmes, ViaturaQdvBaseLista } from '@argus/shared-types';
import {
  parseContatosLogisticasCsv,
  parseQdvBaseListaCsv,
  parseVtrListaPrincipalCsv,
} from './viaturas-qdv-extras-csv-parser';

const CACHE_TTL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15_000;

interface CacheEntry<T> {
  parsed: T[];
  syncedAt: number;
}

/**
 * S0.5/3.1 — Lê as 3 abas adicionais da planilha QDV:
 *   - BASE_LISTA
 *   - BASE_VTR_LISTA_PRINCIPAL
 *   - Contatos_LOGISTICAS
 *
 * Cada aba tem cache independente (TTL 5min) + lock inflight + fallback
 * stale, espelhando `ViaturasQdvService` (aba 1BBM_1CIA).
 */
@Injectable()
export class ViaturasQdvExtrasService {
  private readonly logger = new Logger(ViaturasQdvExtrasService.name);
  private cacheBaseLista: CacheEntry<ViaturaQdvBaseLista> | null = null;
  private cacheVtrPrincipal: CacheEntry<ViaturaCbmes> | null = null;
  private cacheContatos: CacheEntry<ContatoLogistico> | null = null;
  private inflightBaseLista: Promise<CacheEntry<ViaturaQdvBaseLista>> | null = null;
  private inflightVtrPrincipal: Promise<CacheEntry<ViaturaCbmes>> | null = null;
  private inflightContatos: Promise<CacheEntry<ContatoLogistico>> | null = null;

  constructor(private readonly config: ConfigService) {}

  listBaseLista(): Promise<ViaturaQdvBaseLista[]> {
    return this.getCached('BASE_LISTA', () => this.fetchBaseLista()).then((e) => e.parsed);
  }

  listVtrPrincipal(): Promise<ViaturaCbmes[]> {
    return this.getCached('BASE_VTR_LISTA_PRINCIPAL', () => this.fetchVtrPrincipal()).then(
      (e) => e.parsed,
    );
  }

  listContatosLogisticas(): Promise<ContatoLogistico[]> {
    return this.getCached('Contatos_LOGISTICAS', () => this.fetchContatos()).then((e) => e.parsed);
  }

  getSyncStatusBaseLista(): { syncedAt: string | null; count: number; stale: boolean } {
    return cacheStatus(this.cacheBaseLista);
  }

  getSyncStatusVtrPrincipal(): { syncedAt: string | null; count: number; stale: boolean } {
    return cacheStatus(this.cacheVtrPrincipal);
  }

  getSyncStatusContatos(): { syncedAt: string | null; count: number; stale: boolean } {
    return cacheStatus(this.cacheContatos);
  }

  async forceSyncBaseLista(): Promise<{ syncedAt: string; count: number }> {
    const entry = await this.fetchBaseLista();
    this.cacheBaseLista = entry;
    return { syncedAt: new Date(entry.syncedAt).toISOString(), count: entry.parsed.length };
  }

  async forceSyncVtrPrincipal(): Promise<{ syncedAt: string; count: number }> {
    const entry = await this.fetchVtrPrincipal();
    this.cacheVtrPrincipal = entry;
    return { syncedAt: new Date(entry.syncedAt).toISOString(), count: entry.parsed.length };
  }

  async forceSyncContatos(): Promise<{ syncedAt: string; count: number }> {
    const entry = await this.fetchContatos();
    this.cacheContatos = entry;
    return { syncedAt: new Date(entry.syncedAt).toISOString(), count: entry.parsed.length };
  }

  private async getCached<T>(
    sheetName: string,
    fetch: () => Promise<CacheEntry<T>>,
  ): Promise<CacheEntry<T>> {
    const cache = this.getCacheFor<T>(sheetName);
    const now = Date.now();
    if (cache && now - cache.syncedAt < CACHE_TTL_MS) return cache;
    const inflight = this.getInflightFor<T>(sheetName);
    if (inflight) return inflight;
    const promise = fetch().finally(() => this.setInflightFor(sheetName, null));
    this.setInflightFor(sheetName, promise as Promise<CacheEntry<unknown>>);
    try {
      const entry = await promise;
      this.setCacheFor(sheetName, entry);
      return entry;
    } catch (err) {
      this.logger.error(
        `Falha ao sincronizar QDV/${sheetName}: ${(err as Error).message}. ${cache ? 'Servindo último snapshot.' : 'Sem snapshot anterior.'}`,
      );
      if (cache) return cache;
      throw new ServiceUnavailableException(
        `Não foi possível sincronizar com a planilha QDV (aba ${sheetName}) e não há snapshot anterior.`,
      );
    }
  }

  private getCacheFor<T>(sheetName: string): CacheEntry<T> | null {
    if (sheetName === 'BASE_LISTA') return this.cacheBaseLista as CacheEntry<T> | null;
    if (sheetName === 'BASE_VTR_LISTA_PRINCIPAL')
      return this.cacheVtrPrincipal as CacheEntry<T> | null;
    return this.cacheContatos as CacheEntry<T> | null;
  }

  private setCacheFor<T>(sheetName: string, entry: CacheEntry<T>): void {
    if (sheetName === 'BASE_LISTA') this.cacheBaseLista = entry as CacheEntry<ViaturaQdvBaseLista>;
    else if (sheetName === 'BASE_VTR_LISTA_PRINCIPAL')
      this.cacheVtrPrincipal = entry as CacheEntry<ViaturaCbmes>;
    else this.cacheContatos = entry as CacheEntry<ContatoLogistico>;
  }

  private getInflightFor<T>(sheetName: string): Promise<CacheEntry<T>> | null {
    if (sheetName === 'BASE_LISTA') return this.inflightBaseLista as Promise<CacheEntry<T>> | null;
    if (sheetName === 'BASE_VTR_LISTA_PRINCIPAL')
      return this.inflightVtrPrincipal as Promise<CacheEntry<T>> | null;
    return this.inflightContatos as Promise<CacheEntry<T>> | null;
  }

  private setInflightFor(sheetName: string, promise: Promise<CacheEntry<unknown>> | null): void {
    if (sheetName === 'BASE_LISTA')
      this.inflightBaseLista = promise as Promise<CacheEntry<ViaturaQdvBaseLista>> | null;
    else if (sheetName === 'BASE_VTR_LISTA_PRINCIPAL')
      this.inflightVtrPrincipal = promise as Promise<CacheEntry<ViaturaCbmes>> | null;
    else this.inflightContatos = promise as Promise<CacheEntry<ContatoLogistico>> | null;
  }

  private async fetchBaseLista(): Promise<CacheEntry<ViaturaQdvBaseLista>> {
    const csv = await this.fetchCsv('BASE_LISTA');
    return { parsed: parseQdvBaseListaCsv(csv), syncedAt: Date.now() };
  }

  private async fetchVtrPrincipal(): Promise<CacheEntry<ViaturaCbmes>> {
    const csv = await this.fetchCsv('BASE_VTR_LISTA_PRINCIPAL');
    return { parsed: parseVtrListaPrincipalCsv(csv), syncedAt: Date.now() };
  }

  private async fetchContatos(): Promise<CacheEntry<ContatoLogistico>> {
    const csv = await this.fetchCsv('Contatos_LOGISTICAS');
    return { parsed: parseContatosLogisticasCsv(csv), syncedAt: Date.now() };
  }

  private async fetchCsv(sheetName: string): Promise<string> {
    const sheetId =
      this.config.get<string>('QDV_SHEET_ID') ?? '1iqjSDXpbAjtbi7lvd5_5brims8Ipr-OTVXhQMGiv2I8';
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
      if (!res.ok) throw new Error(`HTTP ${res.status} ao baixar ${sheetName}`);
      return await res.text();
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

function cacheStatus(cache: { syncedAt: number; parsed: unknown[] } | null): {
  syncedAt: string | null;
  count: number;
  stale: boolean;
} {
  if (!cache) return { syncedAt: null, count: 0, stale: false };
  return {
    syncedAt: new Date(cache.syncedAt).toISOString(),
    count: cache.parsed.length,
    stale: Date.now() - cache.syncedAt >= CACHE_TTL_MS,
  };
}

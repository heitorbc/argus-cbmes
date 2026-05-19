import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { parseQdiCsv, type MilitarQdi } from './qdi-csv-parser';

const CACHE_TTL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15_000;

interface CacheEntry {
  /** Mapa indexado por NF para lookup O(1) na consolidação. */
  byNf: Map<string, MilitarQdi>;
  syncedAt: number;
}

/**
 * Lê a planilha QDI (Quadro de Distribuição Interna) do 1º BBM via CSV público.
 * Espelha o padrão do `EfetivoService`: cache TTL 5min, lock inflight, fallback stale.
 *
 * Decisão arquitetural (ADR-003): leitura via export CSV público sem OAuth/SA,
 * pois a planilha é configurada como "anyone with link can view".
 */
@Injectable()
export class QdiService {
  private readonly logger = new Logger(QdiService.name);
  private cache: CacheEntry | null = null;
  private inflight: Promise<CacheEntry> | null = null;

  constructor(private readonly config: ConfigService) {}

  /** Retorna o mapa NF → MilitarQdi, com flag `stale`. */
  async getByNf(): Promise<{ byNf: Map<string, MilitarQdi>; syncedAt: number; stale: boolean }> {
    const { entry, stale } = await this.getEntry();
    return { byNf: entry.byNf, syncedAt: entry.syncedAt, stale };
  }

  /** Retorna lista de todos os militares da 1ª Cia identificados no QDI. */
  async listAll(): Promise<{ items: MilitarQdi[]; syncedAt: number; stale: boolean }> {
    const { entry, stale } = await this.getEntry();
    return {
      items: Array.from(entry.byNf.values()),
      syncedAt: entry.syncedAt,
      stale,
    };
  }

  /**
   * S2.10.8a — Status visível em `/configuracoes/integracoes`. Como QDI é
   * real-time (não persiste em Postgres), o `count` reflete o tamanho do
   * cache atual e `stale=true` quando TTL expirou.
   */
  getSyncStatus(): { syncedAt: string | null; count: number; stale: boolean } {
    if (!this.cache) return { syncedAt: null, count: 0, stale: false };
    const stale = Date.now() - this.cache.syncedAt >= CACHE_TTL_MS;
    return {
      syncedAt: new Date(this.cache.syncedAt).toISOString(),
      count: this.cache.byNf.size,
      stale,
    };
  }

  /** S2.10.8a — Força resync (admin). Lança ServiceUnavailable se falhar. */
  async forceSync(): Promise<{ syncedAt: string; count: number }> {
    try {
      const entry = await this.fetchAndParse();
      this.cache = entry;
      return { syncedAt: new Date(entry.syncedAt).toISOString(), count: entry.byNf.size };
    } catch (err) {
      this.logger.error(`forceSync QDI falhou: ${(err as Error).message}`);
      throw new ServiceUnavailableException('Não foi possível sincronizar com a planilha QDI.');
    }
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
        `Falha ao sincronizar QDI: ${(err as Error).message}. ${this.cache ? 'Servindo último snapshot.' : 'Sem snapshot anterior.'}`,
      );
      if (this.cache) return { entry: this.cache, stale: true };
      throw new ServiceUnavailableException(
        'Não foi possível sincronizar com a planilha QDI e não há snapshot anterior.',
      );
    }
  }

  private async fetchAndParse(): Promise<CacheEntry> {
    const sheetId =
      this.config.get<string>('GOOGLE_SHEET_ID_QDI') ??
      '12-XCsNwr34d625Wkkuq-mr4bmv2Fcr2QQ1C7WfVjwB0';
    const gid = this.config.get<string>('GOOGLE_SHEET_GID_QDI') ?? '558859373';
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let csv: string;
    try {
      const res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ao baixar QDI`);
      }
      csv = await res.text();
    } finally {
      clearTimeout(timeoutId);
    }

    const militares = parseQdiCsv(csv);
    if (militares.length === 0) {
      throw new Error('QDI retornou vazio após parse — provavelmente a estrutura mudou');
    }

    const byNf = new Map<string, MilitarQdi>();
    for (const m of militares) byNf.set(m.nf, m);

    return { byNf, syncedAt: Date.now() };
  }
}

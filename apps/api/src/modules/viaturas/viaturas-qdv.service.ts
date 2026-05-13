import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ViaturaQdv } from '@argus/shared-types';
import { parseViaturasQdvCsv } from './viaturas-qdv-csv-parser';

const CACHE_TTL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15_000;

interface CacheEntry {
  parsed: ViaturaQdv[];
  syncedAt: number;
}

/**
 * Item 3 — Lê a aba "1BBM_1CIA" da planilha QDV (read-only).
 *
 * Env vars:
 * - `QDV_SHEET_ID` (default = ID da planilha institucional)
 * - `QDV_SHEET_NAME` (default = "1BBM_1CIA")
 */
@Injectable()
export class ViaturasQdvService {
  private readonly logger = new Logger(ViaturasQdvService.name);
  private cache: CacheEntry | null = null;
  private inflight: Promise<CacheEntry> | null = null;

  constructor(private readonly config: ConfigService) {}

  async listAll(): Promise<ViaturaQdv[]> {
    const { entry } = await this.getEntry();
    return entry.parsed;
  }

  async findByPrefixo(prefixo: string): Promise<ViaturaQdv | null> {
    const all = await this.listAll();
    const norm = prefixo.trim().toUpperCase();
    return all.find((v) => v.prefixo.toUpperCase() === norm) ?? null;
  }

  reset(): void {
    this.cache = null;
    this.inflight = null;
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
        `Falha ao sincronizar QDV: ${(err as Error).message}. ${this.cache ? 'Servindo último snapshot.' : 'Sem snapshot anterior.'}`,
      );
      if (this.cache) return { entry: this.cache, stale: true };
      throw new ServiceUnavailableException(
        'Não foi possível sincronizar com a planilha QDV e não há snapshot anterior.',
      );
    }
  }

  private async fetchAndParse(): Promise<CacheEntry> {
    const sheetId =
      this.config.get<string>('QDV_SHEET_ID') ?? '1iqjSDXpbAjtbi7lvd5_5brims8Ipr-OTVXhQMGiv2I8';
    const sheetName = this.config.get<string>('QDV_SHEET_NAME') ?? '1BBM_1CIA';
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let csv: string;
    try {
      const res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
      if (!res.ok) throw new Error(`HTTP ${res.status} ao baixar QDV`);
      csv = await res.text();
    } finally {
      clearTimeout(timeoutId);
    }
    const parsed = parseViaturasQdvCsv(csv);
    return { parsed, syncedAt: Date.now() };
  }
}

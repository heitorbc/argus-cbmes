import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DispensaSheet } from '@argus/shared-types';
import { parseDispensasSheetCsv } from './dispensas-sheet-csv-parser';

const CACHE_TTL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15_000;

interface CacheEntry {
  parsed: DispensaSheet[];
  syncedAt: number;
}

/**
 * Item 2 — Lê a aba "Dispensas 2026" da planilha "Efetivo - Dados Gerais".
 *
 * Mesmo padrão de cache + lock + fallback. Por usar `gviz/tq` em vez de
 * `export?format=csv`, conseguimos referenciar a aba pelo nome (sem
 * precisar do GID).
 *
 * Configurável via env: `DISPENSAS_SHEET_ID` (default = mesmo do Efetivo)
 * e `DISPENSAS_SHEET_NAME` (default = "Dispensas 2026").
 */
@Injectable()
export class DispensasSheetService {
  private readonly logger = new Logger(DispensasSheetService.name);
  private cache: CacheEntry | null = null;
  private inflight: Promise<CacheEntry> | null = null;

  constructor(private readonly config: ConfigService) {}

  async listAll(): Promise<DispensaSheet[]> {
    const { entry } = await this.getEntry();
    return entry.parsed;
  }

  async listByMilitar(militarRawSubstring: string): Promise<DispensaSheet[]> {
    const all = await this.listAll();
    const needle = militarRawSubstring.trim().toUpperCase();
    if (!needle) return all;
    return all.filter((d) => d.militarRaw.toUpperCase().includes(needle));
  }

  async listByPeriodo(dataIniIso: string, dataFimIso: string): Promise<DispensaSheet[]> {
    const all = await this.listAll();
    return all.filter((d) => d.data >= dataIniIso && d.data <= dataFimIso);
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
        `Falha ao sincronizar Dispensas Sheet: ${(err as Error).message}. ${this.cache ? 'Servindo último snapshot.' : 'Sem snapshot anterior.'}`,
      );
      if (this.cache) return { entry: this.cache, stale: true };
      throw new ServiceUnavailableException(
        'Não foi possível sincronizar com a planilha de Dispensas e não há snapshot anterior.',
      );
    }
  }

  private async fetchAndParse(): Promise<CacheEntry> {
    const sheetId =
      this.config.get<string>('DISPENSAS_SHEET_ID') ??
      this.config.get<string>('GOOGLE_SHEET_ID_EFETIVO') ??
      '1gA17VKQNV8xlnqIhAJfu57TW1GS6VH2YDrcJZk405do';
    const sheetName = this.config.get<string>('DISPENSAS_SHEET_NAME') ?? 'Dispensas 2026';
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let csv: string;
    try {
      const res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
      if (!res.ok) throw new Error(`HTTP ${res.status} ao baixar Dispensas Sheet`);
      csv = await res.text();
    } finally {
      clearTimeout(timeoutId);
    }

    const parsed = parseDispensasSheetCsv(csv);
    return { parsed, syncedAt: Date.now() };
  }
}

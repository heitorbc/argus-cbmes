import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ChefeOperacoes } from '@argus/shared-types';
import { chefesDoDia, parseChefesOperacoesCsv } from './chefes-operacoes-csv-parser';

const CACHE_TTL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15_000;

interface CacheEntry {
  parsed: ReturnType<typeof parseChefesOperacoesCsv>;
  syncedAt: number;
}

/**
 * Lê a planilha "Escala de Chefe de Operações" via CSV público.
 * Padrão idêntico a `QdiService` (cache TTL 5min, lock inflight, fallback stale).
 *
 * Configurável via env: `CHOP_SHEET_ID` e `CHOP_SHEET_GID`. Defaults:
 *   sheetId = `1Nlr_uSNVD6dByaWPTL6IttSOa2nQPXO-m7FqTpeH8WI`
 *   gid     = `1250546399`
 */
@Injectable()
export class ChefesOperacoesService {
  private readonly logger = new Logger(ChefesOperacoesService.name);
  private cache: CacheEntry | null = null;
  private inflight: Promise<CacheEntry> | null = null;

  constructor(private readonly config: ConfigService) {}

  async getEscaladosDoDia(_ano: number, _mes: number, dia: number): Promise<ChefeOperacoes[]> {
    const { entry } = await this.getEntry();
    return chefesDoDia(entry.parsed, dia);
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
        `Falha ao sincronizar ChOp: ${(err as Error).message}. ${this.cache ? 'Servindo último snapshot.' : 'Sem snapshot anterior.'}`,
      );
      if (this.cache) return { entry: this.cache, stale: true };
      throw new ServiceUnavailableException(
        'Não foi possível sincronizar com a planilha de ChOp e não há snapshot anterior.',
      );
    }
  }

  private async fetchAndParse(): Promise<CacheEntry> {
    const sheetId =
      this.config.get<string>('CHOP_SHEET_ID') ?? '1Nlr_uSNVD6dByaWPTL6IttSOa2nQPXO-m7FqTpeH8WI';
    const gid = this.config.get<string>('CHOP_SHEET_GID') ?? '1250546399';
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let csv: string;
    try {
      const res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
      if (!res.ok) throw new Error(`HTTP ${res.status} ao baixar ChOp`);
      csv = await res.text();
    } finally {
      clearTimeout(timeoutId);
    }

    const parsed = parseChefesOperacoesCsv(csv);
    if (parsed.length === 0) {
      throw new Error('ChOp retornou vazio após parse — provavelmente a estrutura mudou');
    }

    return { parsed, syncedAt: Date.now() };
  }
}

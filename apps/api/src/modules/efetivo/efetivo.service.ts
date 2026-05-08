import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EfetivoListResponse, EfetivoQuery, Militar } from '@argus/shared-types';
import { parseEfetivoCsv } from './efetivo-csv-parser';

/** TTL do cache em ms (5 min). */
const CACHE_TTL_MS = 5 * 60 * 1000;

/** Timeout de fetch em ms (15 s). */
const FETCH_TIMEOUT_MS = 15_000;

interface CacheEntry {
  militares: Militar[];
  syncedAt: number;
}

@Injectable()
export class EfetivoService {
  private readonly logger = new Logger(EfetivoService.name);
  private cache: CacheEntry | null = null;
  /** Promise de fetch em andamento (evita chamadas concorrentes ao Google). */
  private inflight: Promise<CacheEntry> | null = null;

  constructor(private readonly config: ConfigService) {}

  async list(query: EfetivoQuery): Promise<EfetivoListResponse> {
    const { entry, stale } = await this.getEntry();

    let items = entry.militares;

    if (query.q) {
      const needle = query.q.toLowerCase();
      items = items.filter(
        (m) =>
          m.nf.toLowerCase().includes(needle) ||
          m.nome.toLowerCase().includes(needle) ||
          m.posto.toLowerCase().includes(needle),
      );
    }

    const total = items.length;
    const totalPages = Math.max(1, Math.ceil(total / query.pageSize));
    const page = Math.min(query.page, totalPages);
    const start = (page - 1) * query.pageSize;
    const paginated = items.slice(start, start + query.pageSize);

    return {
      items: paginated,
      total,
      page,
      pageSize: query.pageSize,
      totalPages,
      syncedAt: new Date(entry.syncedAt).toISOString(),
      stale,
    };
  }

  async findByNf(nf: string): Promise<Militar | null> {
    const { entry } = await this.getEntry();
    return entry.militares.find((m) => m.nf === nf) ?? null;
  }

  /** Força resync, ignorando cache. Mantém último snapshot como fallback se a nova sync falhar. */
  async forceSync(): Promise<EfetivoListResponse> {
    const previous = this.cache;
    try {
      const entry = await this.fetchAndParse();
      this.cache = entry;
      return this.toResponse(entry, false);
    } catch (err) {
      this.logger.error(
        `forceSync falhou: ${(err as Error).message}. ${previous ? 'Servindo último snapshot.' : 'Sem snapshot anterior.'}`,
      );
      if (previous) {
        return this.toResponse(previous, true);
      }
      throw new ServiceUnavailableException(
        'Não foi possível sincronizar com a planilha de Efetivo e não há snapshot anterior.',
      );
    }
  }

  private toResponse(entry: CacheEntry, stale: boolean): EfetivoListResponse {
    const total = entry.militares.length;
    const pageSize = 20;
    return {
      items: entry.militares.slice(0, pageSize),
      total,
      page: 1,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      syncedAt: new Date(entry.syncedAt).toISOString(),
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
        `Falha ao sincronizar Efetivo: ${(err as Error).message}. Servindo último snapshot.`,
      );
      if (this.cache) {
        return { entry: this.cache, stale: true };
      }
      throw new ServiceUnavailableException(
        'Não foi possível sincronizar com a planilha de Efetivo e não há snapshot anterior.',
      );
    }
  }

  private async fetchAndParse(): Promise<CacheEntry> {
    const sheetId = this.config.getOrThrow<string>('GOOGLE_SHEET_ID_EFETIVO');
    const gid = this.config.get<string>('GOOGLE_SHEET_GID_EFETIVO') ?? '1379090962';
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let csv: string;
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        redirect: 'follow',
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ao baixar CSV de Efetivo`);
      }
      csv = await res.text();
    } finally {
      clearTimeout(timeoutId);
    }

    const militares = parseEfetivoCsv(csv);
    if (militares.length === 0) {
      throw new Error('CSV de Efetivo retornou vazio após parse — provavelmente formato mudou');
    }

    return { militares, syncedAt: Date.now() };
  }
}

import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EfetivoListResponse, EfetivoQuery, Militar } from '@argus/shared-types';
import { parseEfetivoCsv } from './efetivo-csv-parser';
import type { MilitarQdi } from './qdi-csv-parser';
import { QdiService } from './qdi.service';

const CACHE_TTL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15_000;

interface EfetivoCacheEntry {
  /** Militares lidos do CSV EFETIVO (sem dados de QDI ainda). */
  byNf: Map<string, Militar>;
  syncedAt: number;
}

/**
 * Consolida duas fontes de Militares:
 *   - EFETIVO (Sargenteante) — demográfica do CBMES inteiro: nome completo, idade, serviço.
 *   - QDI (1º BBM) — operacional 1ª Cia: nome de guerra, posto atual, função, sub-seção.
 *
 * Estratégia (decisão Tech Lead 2026-05-08):
 *   - QDI é primária para ANT, posto, situação, função (substitui valores do EFETIVO se conflito).
 *   - EFETIVO é complementar (nome completo, idade, serviço, município).
 *   - União de NFs: militar presente em qualquer fonte aparece na lista.
 *   - Filtro `somente1aCia=true` retorna apenas os com `subSecao` definida (i.e., presentes no QDI da 1ª Cia).
 */
@Injectable()
export class EfetivoService {
  private readonly logger = new Logger(EfetivoService.name);
  private cache: EfetivoCacheEntry | null = null;
  private inflight: Promise<EfetivoCacheEntry> | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly qdi: QdiService,
  ) {}

  async list(query: EfetivoQuery): Promise<EfetivoListResponse> {
    const consolidated = await this.consolidate();

    let items = consolidated.items;

    if (query.somente1aCia) {
      items = items.filter((m) => m.subSecao !== undefined);
    }

    if (query.q) {
      const needle = query.q.toLowerCase();
      items = items.filter(
        (m) =>
          m.nf.toLowerCase().includes(needle) ||
          m.nome.toLowerCase().includes(needle) ||
          m.posto.toLowerCase().includes(needle) ||
          (m.nomeGuerra ?? '').toLowerCase().includes(needle),
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
      syncedAt: new Date(consolidated.syncedAt).toISOString(),
      stale: consolidated.stale,
    };
  }

  async findByNf(nf: string): Promise<Militar | null> {
    const consolidated = await this.consolidate();
    return consolidated.items.find((m) => m.nf === nf) ?? null;
  }

  /** Força resync de ambas as fontes, ignorando cache. */
  async forceSync(): Promise<EfetivoListResponse> {
    const previous = this.cache;
    try {
      const entry = await this.fetchAndParse();
      this.cache = entry;
      const merged = await this.mergeWithQdi(entry);
      return this.toResponse(merged, false);
    } catch (err) {
      this.logger.error(
        `forceSync falhou: ${(err as Error).message}. ${previous ? 'Servindo último snapshot.' : 'Sem snapshot anterior.'}`,
      );
      if (previous) {
        const merged = await this.mergeWithQdi(previous).catch(() => ({
          items: Array.from(previous.byNf.values()),
          syncedAt: previous.syncedAt,
        }));
        return this.toResponse(merged, true);
      }
      throw new ServiceUnavailableException(
        'Não foi possível sincronizar com a planilha de Efetivo e não há snapshot anterior.',
      );
    }
  }

  private toResponse(
    merged: { items: Militar[]; syncedAt: number },
    stale: boolean,
  ): EfetivoListResponse {
    const total = merged.items.length;
    const pageSize = 20;
    return {
      items: merged.items.slice(0, pageSize),
      total,
      page: 1,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      syncedAt: new Date(merged.syncedAt).toISOString(),
      stale,
    };
  }

  /**
   * Consolida EFETIVO + QDI. Se o QDI estiver indisponível, retorna apenas EFETIVO
   * (com `stale=true` se a sync recente do QDI falhou).
   */
  private async consolidate(): Promise<{ items: Militar[]; syncedAt: number; stale: boolean }> {
    const efetivo = await this.getEntry();
    let qdiByNf: Map<string, MilitarQdi> = new Map();
    let qdiStale = false;
    let qdiSyncedAt = efetivo.entry.syncedAt;

    try {
      const qdi = await this.qdi.getByNf();
      qdiByNf = qdi.byNf;
      qdiStale = qdi.stale;
      qdiSyncedAt = qdi.syncedAt;
    } catch (err) {
      this.logger.warn(
        `QDI indisponível: ${(err as Error).message}. Consolidando apenas com EFETIVO.`,
      );
    }

    const merged = mergeSources(efetivo.entry.byNf, qdiByNf);

    return {
      items: merged,
      syncedAt: Math.max(efetivo.entry.syncedAt, qdiSyncedAt),
      stale: efetivo.stale || qdiStale,
    };
  }

  private async mergeWithQdi(entry: EfetivoCacheEntry): Promise<{
    items: Militar[];
    syncedAt: number;
  }> {
    let qdiByNf: Map<string, MilitarQdi> = new Map();
    let qdiSyncedAt = entry.syncedAt;
    try {
      const qdi = await this.qdi.getByNf();
      qdiByNf = qdi.byNf;
      qdiSyncedAt = qdi.syncedAt;
    } catch {
      // segue só com efetivo
    }
    return {
      items: mergeSources(entry.byNf, qdiByNf),
      syncedAt: Math.max(entry.syncedAt, qdiSyncedAt),
    };
  }

  private async getEntry(): Promise<{ entry: EfetivoCacheEntry; stale: boolean }> {
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
        `Falha ao sincronizar Efetivo: ${(err as Error).message}. ${this.cache ? 'Servindo último snapshot.' : 'Sem snapshot anterior.'}`,
      );
      if (this.cache) return { entry: this.cache, stale: true };
      throw new ServiceUnavailableException(
        'Não foi possível sincronizar com a planilha de Efetivo e não há snapshot anterior.',
      );
    }
  }

  private async fetchAndParse(): Promise<EfetivoCacheEntry> {
    const sheetId = this.config.getOrThrow<string>('GOOGLE_SHEET_ID_EFETIVO');
    const gid = this.config.get<string>('GOOGLE_SHEET_GID_EFETIVO') ?? '1379090962';
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let csv: string;
    try {
      const res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
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

    const byNf = new Map<string, Militar>();
    for (const m of militares) byNf.set(m.nf, m);
    return { byNf, syncedAt: Date.now() };
  }
}

/**
 * Merge das duas fontes:
 *  - QDI vence em ANT, posto, situação (se houver no QDI).
 *  - QDI adiciona: nomeGuerra, funcao, unidade, subSecao, postoPrevisto.
 *  - EFETIVO mantém: nome (completo), idade, servico, municipio.
 *  - Militares só no QDI (sem EFETIVO) entram com nome = nomeGuerra (fallback).
 *  - Lista final ordenada por ANT crescente.
 */
function mergeSources(
  efetivoByNf: Map<string, Militar>,
  qdiByNf: Map<string, MilitarQdi>,
): Militar[] {
  const allNfs = new Set<string>([...efetivoByNf.keys(), ...qdiByNf.keys()]);
  const result: Militar[] = [];

  for (const nf of allNfs) {
    const e = efetivoByNf.get(nf);
    const q = qdiByNf.get(nf);

    if (e && q) {
      result.push({
        ...e,
        // QDI vence
        ant: q.ant,
        posto: q.postoAtual,
        situacao: q.situacao ?? e.situacao,
        // QDI agrega
        nomeGuerra: q.nomeGuerra,
        funcao: q.funcao,
        unidade: q.unidade,
        subSecao: q.subSecao,
        postoPrevisto: q.postoPrevisto,
      });
    } else if (e) {
      result.push(e);
    } else if (q) {
      result.push({
        nf: q.nf,
        ant: q.ant,
        posto: q.postoAtual,
        nome: q.nomeGuerra, // fallback obrigatório do schema
        nomeGuerra: q.nomeGuerra,
        funcao: q.funcao,
        unidade: q.unidade,
        subSecao: q.subSecao,
        postoPrevisto: q.postoPrevisto,
        situacao: q.situacao,
      });
    }
  }

  result.sort((a, b) => a.ant - b.ant);
  return result;
}

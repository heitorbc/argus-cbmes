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
import { parseIseoHospitaisCsv } from './iseo-hospitais-csv-parser';

const CACHE_TTL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15_000;

const DEFAULT_SHEET_ID = '1wmFOEsrU219fGMfksoSY5dvQu0UN7HdQ558UUiWRXuw';
const DEFAULT_HPM_GID = '0';
// HIMABA: gid a ser confirmado. Permite override via env. Se vazio,
// a unidade HIMABA é desabilitada (não bloqueia o startup).
const DEFAULT_HIMABA_GID = '';

interface CacheEntry {
  parsed: IseoHospitalEntry[];
  syncedAt: number;
}

/**
 * Lê a planilha "Escala ISEO Hospitais" via CSV público.
 * Cada unidade (HPM/HIMABA) está numa aba (gid) distinta. Mesmo padrão de
 * `ChefesOperacoesService` (cache TTL 5min, inflight dedup, stale fallback).
 *
 * Configurável via env:
 *   `ISEO_HOSPITAIS_SHEET_ID` (default acima)
 *   `ISEO_HPM_GID`  (default `0`)
 *   `ISEO_HIMABA_GID` (default vazio — desabilita HIMABA até ser configurado)
 */
@Injectable()
export class IseoHospitaisService {
  private readonly logger = new Logger(IseoHospitaisService.name);
  private readonly cache = new Map<IseoHospitalUnidade, CacheEntry>();
  private readonly inflight = new Map<IseoHospitalUnidade, Promise<CacheEntry>>();

  constructor(private readonly config: ConfigService) {}

  /** Lista todos os registros (HPM + HIMABA combinados). */
  async list(): Promise<IseoHospitalEntry[]> {
    const entries: IseoHospitalEntry[] = [];
    for (const unidade of this.unidadesHabilitadas()) {
      try {
        const { entry } = await this.getEntry(unidade);
        entries.push(...entry.parsed);
      } catch (err) {
        this.logger.warn(
          `Falha ao listar ISEO ${unidade}: ${(err as Error).message}. Pulando.`,
        );
      }
    }
    return entries;
  }

  async listByUnidade(unidade: IseoHospitalUnidade): Promise<IseoHospitalEntry[]> {
    if (!this.isUnidadeHabilitada(unidade)) return [];
    const { entry } = await this.getEntry(unidade);
    return entry.parsed.slice();
  }

  async listDoDia(dataIso: string): Promise<IseoHospitalEntry[]> {
    const all = await this.list();
    return all.filter((e) => e.dataIso === dataIso);
  }

  async listByMilitar(nf: string): Promise<IseoHospitalEntry[]> {
    const all = await this.list();
    return all.filter((e) => e.nf === nf);
  }

  /** Status por unidade — usado em `/configuracoes/integracoes`. */
  getSyncStatus(): IseoHospitalSyncStatus[] {
    const out: IseoHospitalSyncStatus[] = [];
    for (const unidade of this.unidadesHabilitadas()) {
      const c = this.cache.get(unidade);
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
    for (const unidade of this.unidadesHabilitadas()) {
      try {
        const entry = await this.fetchAndParse(unidade);
        this.cache.set(unidade, entry);
      } catch (err) {
        this.logger.error(
          `forceSync ISEO ${unidade} falhou: ${(err as Error).message}.`,
        );
      }
    }
    return this.getSyncStatus();
  }

  private unidadesHabilitadas(): IseoHospitalUnidade[] {
    const out: IseoHospitalUnidade[] = [];
    if (this.gidFor('HPM')) out.push('HPM');
    if (this.gidFor('HIMABA')) out.push('HIMABA');
    return out;
  }

  private isUnidadeHabilitada(unidade: IseoHospitalUnidade): boolean {
    return Boolean(this.gidFor(unidade));
  }

  private gidFor(unidade: IseoHospitalUnidade): string {
    if (unidade === 'HPM') {
      return this.config.get<string>('ISEO_HPM_GID') ?? DEFAULT_HPM_GID;
    }
    return this.config.get<string>('ISEO_HIMABA_GID') ?? DEFAULT_HIMABA_GID;
  }

  private async getEntry(
    unidade: IseoHospitalUnidade,
  ): Promise<{ entry: CacheEntry; stale: boolean }> {
    const now = Date.now();
    const cached = this.cache.get(unidade);
    if (cached && now - cached.syncedAt < CACHE_TTL_MS) {
      return { entry: cached, stale: false };
    }
    const existing = this.inflight.get(unidade);
    if (existing) {
      const entry = await existing;
      return { entry, stale: false };
    }
    const promise = this.fetchAndParse(unidade).finally(() => {
      this.inflight.delete(unidade);
    });
    this.inflight.set(unidade, promise);
    try {
      const entry = await promise;
      this.cache.set(unidade, entry);
      return { entry, stale: false };
    } catch (err) {
      this.logger.error(
        `Falha ao sincronizar ISEO ${unidade}: ${(err as Error).message}. ${
          cached ? 'Servindo último snapshot.' : 'Sem snapshot anterior.'
        }`,
      );
      if (cached) return { entry: cached, stale: true };
      throw new ServiceUnavailableException(
        `Não foi possível sincronizar com a planilha ISEO Hospitais (${unidade}).`,
      );
    }
  }

  private async fetchAndParse(unidade: IseoHospitalUnidade): Promise<CacheEntry> {
    const sheetId = this.config.get<string>('ISEO_HOSPITAIS_SHEET_ID') ?? DEFAULT_SHEET_ID;
    const gid = this.gidFor(unidade);
    if (!gid) {
      throw new Error(`GID não configurado para unidade ${unidade}.`);
    }
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let csv: string;
    try {
      const res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
      if (!res.ok) throw new Error(`HTTP ${res.status} ao baixar ISEO ${unidade}`);
      csv = await res.text();
    } finally {
      clearTimeout(timeoutId);
    }

    const parsed = parseIseoHospitaisCsv(csv, { unidade });
    return { parsed, syncedAt: Date.now() };
  }
}

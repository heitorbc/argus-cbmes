import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { MapaForcaSnapshot, RecursoMapaForca } from '@argus/shared-types';
import { RecursosService } from '../recursos/recursos.service';
import { UNIDADE_1CIA_1BBM_ID } from '../unidades/unidades.service';
import { parseMapaForcaCsv } from './mapa-forca-ciodes-csv-parser';

/**
 * S2.10.9a — TTL adaptativo. Em janelas operacionais críticas (passagem
 * de turno 07-09h + início noturno 18-20h, hora local America/Sao_Paulo),
 * cache curto para refletir alterações rapidamente. Fora dessas janelas,
 * cache longo para reduzir fetch Google em 3-4x.
 */
const CACHE_TTL_CRITICAL_MS = 5 * 60 * 1000;
const CACHE_TTL_RELAXED_MS = 20 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15_000;

interface CacheEntry {
  recursos: RecursoMapaForca[];
  fiscalDoDia?: string;
  syncedAt: number;
}

/**
 * Lê os recursos da 1ª Cia direto da aba `1º BBM` do Mapa Força via CSV público.
 *
 * Mesma estratégia de `EfetivoService`/`QdiService`:
 * - Cache TTL 5min
 * - Inflight lock (deduplica fetch concorrente)
 * - Fallback stale (se nova sync falhar, devolve último snapshot com `stale=true`)
 * - Timeout 15s na chamada HTTP
 *
 * Decisão (S5/F1, ADR-006): leitura direta sem auth — Mapa Força é compartilhado entre OBMs
 * via "qualquer um com o link pode editar", e o export CSV não exige login. Idem ao padrão
 * já adotado para Efetivo/QDI.
 *
 * Para escrita do Mapa Força (S9): outra estratégia (Puppeteer + conta institucional).
 */
@Injectable()
export class MapaForcaCiodesService {
  private readonly logger = new Logger(MapaForcaCiodesService.name);
  private cache: CacheEntry | null = null;
  private inflight: Promise<CacheEntry> | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly recursos: RecursosService,
  ) {}

  /** Devolve o snapshot mais recente. Pode estar stale se a última sync falhou. */
  async getSnapshot(): Promise<MapaForcaSnapshot> {
    const { entry, stale } = await this.getEntry();
    return {
      recursos: entry.recursos,
      syncedAt: new Date(entry.syncedAt).toISOString(),
      stale,
      fiscalDoDia: entry.fiscalDoDia,
    };
  }

  /** Atalho para apenas a lista de recursos (consumido por ViaturasService e PreviaService). */
  async getRecursos(): Promise<readonly RecursoMapaForca[]> {
    const { entry } = await this.getEntry();
    return entry.recursos;
  }

  /** Procura um recurso pelo nome canônico da col A (ex.: "MERGULHO 02"). */
  async findByRecurso(recurso: string): Promise<RecursoMapaForca | null> {
    const recursos = await this.getRecursos();
    return recursos.find((r) => r.recurso === recurso) ?? null;
  }

  /**
   * S2.10.8a — Status visível em `/configuracoes/integracoes`. Mapa Força
   * CIODES é REAL-TIME ONLY por decisão D2 do plano (não persiste em Postgres
   * pois sofre edições frequentes diretamente na planilha).
   */
  getSyncStatus(): { syncedAt: string | null; count: number; stale: boolean } {
    if (!this.cache) return { syncedAt: null, count: 0, stale: false };
    const stale = Date.now() - this.cache.syncedAt >= this.getTtlMs();
    return {
      syncedAt: new Date(this.cache.syncedAt).toISOString(),
      count: this.cache.recursos.length,
      stale,
    };
  }

  /**
   * S2.10.9a — Retorna o TTL atual conforme a hora local. Janelas críticas
   * (07-09h e 18-20h hora America/Sao_Paulo) usam TTL curto; fora delas o
   * TTL é longo (reduz fetch Google fora dos horários sensíveis).
   */
  private getTtlMs(): number {
    const hour = nowLocalHour();
    const inCriticalWindow = (hour >= 7 && hour < 9) || (hour >= 18 && hour < 20);
    return inCriticalWindow ? CACHE_TTL_CRITICAL_MS : CACHE_TTL_RELAXED_MS;
  }

  /**
   * S2.10.8a — Adapter para SourceConfig do IntegracoesService. Devolve
   * `{syncedAt, count}` em vez de `MapaForcaSnapshot` para uniformidade.
   */
  async forceSyncAsSource(): Promise<{ syncedAt: string; count: number }> {
    const snapshot = await this.forceSync();
    return { syncedAt: snapshot.syncedAt, count: snapshot.recursos.length };
  }

  /** Força resync, ignorando cache. */
  async forceSync(): Promise<MapaForcaSnapshot> {
    const previous = this.cache;
    try {
      const entry = await this.fetchAndParse();
      this.cache = entry;
      return {
        recursos: entry.recursos,
        syncedAt: new Date(entry.syncedAt).toISOString(),
        stale: false,
        fiscalDoDia: entry.fiscalDoDia,
      };
    } catch (err) {
      this.logger.error(
        `forceSync falhou: ${(err as Error).message}. ${
          previous ? 'Servindo último snapshot.' : 'Sem snapshot anterior.'
        }`,
      );
      if (previous) {
        return {
          recursos: previous.recursos,
          syncedAt: new Date(previous.syncedAt).toISOString(),
          stale: true,
          fiscalDoDia: previous.fiscalDoDia,
        };
      }
      throw new ServiceUnavailableException(
        'Não foi possível sincronizar com a planilha do Mapa Força e não há snapshot anterior.',
      );
    }
  }

  private async getEntry(): Promise<{ entry: CacheEntry; stale: boolean }> {
    const now = Date.now();
    if (this.cache && now - this.cache.syncedAt < this.getTtlMs()) {
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
        `Falha ao sincronizar Mapa Força: ${(err as Error).message}. ${
          this.cache ? 'Servindo último snapshot.' : 'Sem snapshot anterior.'
        }`,
      );
      if (this.cache) return { entry: this.cache, stale: true };
      throw new ServiceUnavailableException(
        'Não foi possível sincronizar com o Mapa Força e não há snapshot anterior.',
      );
    }
  }

  private async fetchAndParse(): Promise<CacheEntry> {
    const sheetId = this.config.getOrThrow<string>('GOOGLE_SHEET_ID_MAPA_FORCA');
    const gid = this.config.get<string>('GOOGLE_SHEET_GID_MAPA_FORCA') ?? '1468029336';
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let csv: string;
    try {
      const res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ao baixar CSV do Mapa Força`);
      }
      csv = await res.text();
    } finally {
      clearTimeout(timeoutId);
    }

    // S6d/F3 — whitelist vem da entidade Recurso (1ª Cia/1º BBM).
    const recursosValidos = this.recursos.nomesValidos(UNIDADE_1CIA_1BBM_ID);
    const { recursos, fiscalDoDia, avisos } = parseMapaForcaCsv(csv, { recursosValidos });
    if (recursos.length === 0) {
      throw new Error('CSV do Mapa Força retornou 0 recursos — formato provavelmente mudou');
    }
    for (const a of avisos) this.logger.warn(`Mapa Força: ${a}`);
    return { recursos, fiscalDoDia, syncedAt: Date.now() };
  }
}

/**
 * S2.10.9a — Hora local America/Sao_Paulo. Render roda em UTC; sem isso
 * `new Date().getHours()` retornaria a hora UTC, deslocando a janela
 * crítica em 3 horas (errado).
 */
function nowLocalHour(): number {
  const fmt = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: 'numeric',
    hour12: false,
  });
  return Number.parseInt(fmt.format(new Date()), 10);
}

import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ChefeOperacoes } from '@argus/shared-types';
import { EfetivoService } from '../efetivo/efetivo.service';
import { chefesDoDia, parseChefesOperacoesCsv } from './chefes-operacoes-csv-parser';

/**
 * S0.x/fixes-3 — DTO retornado por `listHabilitadosEnriquecido` para o
 * modal de troca de Chefe de Operações na Prévia. Combina a NF do
 * habilitado (planilha ChOp) com posto/nome vindos do efetivo.
 */
export interface ChefeOperacoesHabilitado {
  nf: string;
  posto: string;
  nomeGuerra: string;
  nome: string;
  telefone?: string;
}

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

  constructor(
    private readonly config: ConfigService,
    @Inject(forwardRef(() => EfetivoService))
    private readonly efetivo: EfetivoService,
  ) {}

  /**
   * S0.x/fixes-3 — Lista todos os militares habilitados como ChOp na
   * planilha externa, enriquecidos com posto/nome via `EfetivoService`.
   * Usado pelo modal de troca de ChOp no Mapa Força. Ordena por posto
   * (mais alto primeiro) + nomeGuerra alfabético.
   */
  async listHabilitadosEnriquecido(): Promise<ChefeOperacoesHabilitado[]> {
    const habilitados = await this.getHabilitadosNfs();
    if (habilitados.size === 0) return [];
    const efetivoTotal = await this.efetivo.getAll({
      somente1aCia: false,
      incluirEfetivoOrfao: true,
    });
    const enriquecidos: ChefeOperacoesHabilitado[] = [];
    for (const nf of habilitados) {
      const m = efetivoTotal.find((mil) => mil.nf === nf);
      if (m) {
        enriquecidos.push({
          nf: m.nf,
          posto: m.posto,
          nomeGuerra: m.nomeGuerra ?? m.nome.split(' ')[0] ?? m.nome,
          nome: m.nome,
        });
      } else {
        enriquecidos.push({
          nf,
          posto: '',
          nomeGuerra: '(não resolvido)',
          nome: `NF ${nf}`,
        });
      }
    }
    return enriquecidos.sort((a, b) => a.nomeGuerra.localeCompare(b.nomeGuerra));
  }

  async getEscaladosDoDia(_ano: number, _mes: number, dia: number): Promise<ChefeOperacoes[]> {
    const { entry } = await this.getEntry();
    return chefesDoDia(entry.parsed, dia);
  }

  /**
   * S0.5/0.1.1.3 — Conjunto de NFs habilitados a ser Chefe de Operações
   * (todos os militares listados na planilha de escala ChOp, escalados
   * ou não em um dado dia). Usado para validar trocas autorizadas
   * cuja função envolve ChOp — substituto deve estar habilitado.
   *
   * Retorna `Set` para lookup O(1). Vazio se a planilha não foi
   * sincronizada ainda (sem cache).
   */
  async getHabilitadosNfs(): Promise<Set<string>> {
    try {
      const { entry } = await this.getEntry();
      return new Set(entry.parsed.map((c) => c.nf));
    } catch {
      return new Set();
    }
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

  /**
   * S0.5/PR3 — Força resync ignorando o cache. Usado pelo botão admin em
   * /configuracoes/integracoes.
   */
  async forceSync(): Promise<{ syncedAt: string; count: number }> {
    const previous = this.cache;
    try {
      const entry = await this.fetchAndParse();
      this.cache = entry;
      return { syncedAt: new Date(entry.syncedAt).toISOString(), count: entry.parsed.length };
    } catch (err) {
      this.logger.error(
        `forceSync ChOp falhou: ${(err as Error).message}. ${previous ? 'Mantendo snapshot anterior.' : 'Sem snapshot anterior.'}`,
      );
      throw new ServiceUnavailableException(
        'Não foi possível sincronizar com a planilha de ChOp.',
      );
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

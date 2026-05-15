import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { parseQdiDadosCsv, type MilitarDados } from './qdi-dados-csv-parser';

const CACHE_TTL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15_000;

interface CacheEntry {
  byNf: Map<string, MilitarDados>;
  syncedAt: number;
}

/**
 * Lê a aba `DADOS` do QDI (gid `1395786516`) — fonte primária do Efetivo em S6a.
 *
 * Diferenças vs `QdiService`:
 * - Lê outra aba (DADOS, não 1ª1º)
 * - Aba DADOS é a tabela completa do CBMES — filtro por LOCAL == "1ª1º" no parser
 * - Tem campos extras: classe, conceito disciplinar, pontos, CNH, incorporação, plano férias, etc.
 *
 * ADR-008 (S6a): DADOS > 1ª1º > EFETIVO em prioridade na consolidação.
 */
@Injectable()
export class QdiDadosService {
  private readonly logger = new Logger(QdiDadosService.name);
  private cache: CacheEntry | null = null;
  private inflight: Promise<CacheEntry> | null = null;

  constructor(private readonly config: ConfigService) {}

  async getByNf(): Promise<{ byNf: Map<string, MilitarDados>; syncedAt: number; stale: boolean }> {
    const { entry, stale } = await this.getEntry();
    return { byNf: entry.byNf, syncedAt: entry.syncedAt, stale };
  }

  async listAll(): Promise<{ items: MilitarDados[]; syncedAt: number; stale: boolean }> {
    const { entry, stale } = await this.getEntry();
    return {
      items: Array.from(entry.byNf.values()),
      syncedAt: entry.syncedAt,
      stale,
    };
  }

  /**
   * S0.x/dev-fixes — Busca militares por NF na aba DADOS sem filtro de
   * LOCAL. Usado para resolver dados de ChOps que estão em outras Cias do
   * BBM (não 1ª Cia) e não passariam pelo filtro padrão.
   *
   * Retorna apenas as NFs encontradas (sem filtro de LOCAL).
   */
  async findUnfilteredByNfs(nfs: Set<string>): Promise<Map<string, MilitarDados>> {
    if (nfs.size === 0) return new Map();
    try {
      const csv = await this.fetchRawCsv();
      const all = parseQdiDadosCsv(csv, []);
      const out = new Map<string, MilitarDados>();
      for (const m of all) {
        if (nfs.has(m.nf)) out.set(m.nf, m);
      }
      return out;
    } catch (err) {
      this.logger.warn(`findUnfilteredByNfs falhou: ${(err as Error).message}`);
      return new Map();
    }
  }

  private async fetchRawCsv(): Promise<string> {
    const sheetId =
      this.config.get<string>('GOOGLE_SHEET_ID_QDI') ??
      '12-XCsNwr34d625Wkkuq-mr4bmv2Fcr2QQ1C7WfVjwB0';
    const gid = this.config.get<string>('GOOGLE_SHEET_GID_QDI_DADOS') ?? '1395786516';
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
      if (!res.ok) throw new Error(`HTTP ${res.status} ao baixar aba DADOS do QDI`);
      return await res.text();
    } finally {
      clearTimeout(timeoutId);
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
        `Falha ao sincronizar QDI/DADOS: ${(err as Error).message}. ${
          this.cache ? 'Servindo último snapshot.' : 'Sem snapshot anterior.'
        }`,
      );
      if (this.cache) return { entry: this.cache, stale: true };
      throw new ServiceUnavailableException(
        'Não foi possível sincronizar com a aba DADOS do QDI e não há snapshot anterior.',
      );
    }
  }

  private async fetchAndParse(): Promise<CacheEntry> {
    const csv = await this.fetchRawCsv();
    const militares = parseQdiDadosCsv(csv);
    if (militares.length === 0) {
      throw new Error('QDI/DADOS retornou 0 militares após filtro LOCAL — formato pode ter mudado');
    }

    const byNf = new Map<string, MilitarDados>();
    for (const m of militares) byNf.set(m.nf, m);

    return { byNf, syncedAt: Date.now() };
  }
}

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
 * - Aba DADOS é a tabela completa do CBMES — **multi-unidade desde S2.10.13b**
 *   (sem filtro LOCAL no parser; popular Militar.unidade a partir do campo
 *   LOCAL e deixar o frontend filtrar via dropdown).
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

  /** S2.10.8d — Invalida cache (próximo `getByNf()` força refresh). */
  invalidateCache(): void {
    this.cache = null;
  }

  /**
   * S2.10.8a — Status visível em `/configuracoes/integracoes`. Real-time
   * only (não persiste em Postgres).
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
      this.logger.error(`forceSync QDI DADOS falhou: ${(err as Error).message}`);
      throw new ServiceUnavailableException('Não foi possível sincronizar com a aba DADOS do QDI.');
    }
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
    // S2.10.13b — default `[]` no parser = aceita todas as unidades.
    // Multi-unidade: militares de CG, CEPDEC, DAL, CORREG, DGP, 1ª1º, 2ª1º,
    // etc. são todos consolidados; frontend filtra via dropdown.
    const militares = parseQdiDadosCsv(csv);
    if (militares.length === 0) {
      throw new Error('QDI/DADOS retornou 0 militares — formato da planilha pode ter mudado');
    }

    const byNf = new Map<string, MilitarDados>();
    for (const m of militares) byNf.set(m.nf, m);

    return { byNf, syncedAt: Date.now() };
  }
}

import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EfetivoListResponse, EfetivoQuery, Militar } from '@argus/shared-types';
import { parseEfetivoCsv } from './efetivo-csv-parser';
import type { MilitarDados } from './qdi-dados-csv-parser';
import { QdiDadosService } from './qdi-dados.service';
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
    private readonly qdiDados: QdiDadosService,
  ) {}

  async list(query: EfetivoQuery): Promise<EfetivoListResponse> {
    // Página /cadastros/efetivo NÃO inclui órfãos (S6a-fix item 2):
    // só militares de DADOS (LOCAL=1ª1º) ou 1ª1º.
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
    // findByNf inclui órfãos do EFETIVO (S6c/F1) — necessário para a página de
    // detalhe `/cadastros/efetivo/:nf` resolver militares que estão em escalas
    // mas ainda não foram lançados no QDI 1ª1º.
    const consolidated = await this.consolidate({ incluirEfetivoOrfao: true });
    return consolidated.items.find((m) => m.nf === nf) ?? null;
  }

  /**
   * Retorna a lista consolidada completa (sem paginação). Usada por consumidores
   * que precisam do efetivo inteiro:
   * - **NomeMatcher** (Prévia): chama com `incluirEfetivoOrfao: true` para
   *   resolver militares de escalas que ainda não estão no QDI 1ª1º (S6c/F1).
   * - **Conferência da Equipe** (S6b): também usa o dicionário completo.
   * - **Página /cadastros/efetivo**: chama com `somente1aCia: true` (default
   *   `incluirEfetivoOrfao: false`) — comportamento S6a-fix preservado.
   */
  async getAll(
    options: { somente1aCia?: boolean; incluirEfetivoOrfao?: boolean } = {},
  ): Promise<Militar[]> {
    const consolidated = await this.consolidate({
      incluirEfetivoOrfao: options.incluirEfetivoOrfao,
    });
    if (options.somente1aCia) {
      return consolidated.items.filter((m) => m.subSecao !== undefined);
    }
    return consolidated.items;
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
   * Consolida 3 fontes (S6a/ADR-008): DADOS > 1ª1º > EFETIVO.
   *
   * - **DADOS** (aba LOCAL=1ª1º): primária. Cobre todos os campos básicos + classe/CNH/incorp.
   * - **1ª1º** (aba operacional do QDI): complementar. Adiciona subSecao/funcao/postoPrevisto.
   * - **EFETIVO**: fallback para campos não cobertos (idade, serviço).
   *
   * Se DADOS ou 1ª1º estiverem indisponíveis, segue com o que conseguiu (com `stale=true`).
   *
   * `incluirEfetivoOrfao` (S6c/F1): quando true, militares só presentes em
   * EFETIVO geral (sem entrada em DADOS+1ª1º) também aparecem. Usado pelo
   * NomeMatcher da Prévia para resolver nomes de escalas que ainda não foram
   * lançados no QDI 1ª1º.
   */
  private async consolidate(
    options: { incluirEfetivoOrfao?: boolean } = {},
  ): Promise<{ items: Militar[]; syncedAt: number; stale: boolean }> {
    const efetivo = await this.getEntry();

    let dadosByNf: Map<string, MilitarDados> = new Map();
    let dadosStale = false;
    let dadosSyncedAt = efetivo.entry.syncedAt;
    try {
      const r = await this.qdiDados.getByNf();
      dadosByNf = r.byNf;
      dadosStale = r.stale;
      dadosSyncedAt = r.syncedAt;
    } catch (err) {
      this.logger.warn(
        `QDI/DADOS indisponível: ${(err as Error).message}. Consolidando sem essa fonte.`,
      );
    }

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
        `QDI/1ª1º indisponível: ${(err as Error).message}. Consolidando sem essa fonte.`,
      );
    }

    const merged = mergeThreeSources(dadosByNf, qdiByNf, efetivo.entry.byNf, {
      incluirEfetivoOrfao: options.incluirEfetivoOrfao ?? false,
    });

    return {
      items: merged,
      syncedAt: Math.max(efetivo.entry.syncedAt, qdiSyncedAt, dadosSyncedAt),
      stale: efetivo.stale || qdiStale || dadosStale,
    };
  }

  private async mergeWithQdi(entry: EfetivoCacheEntry): Promise<{
    items: Militar[];
    syncedAt: number;
  }> {
    let qdiByNf: Map<string, MilitarQdi> = new Map();
    let dadosByNf: Map<string, MilitarDados> = new Map();
    let qdiSyncedAt = entry.syncedAt;
    try {
      const qdi = await this.qdi.getByNf();
      qdiByNf = qdi.byNf;
      qdiSyncedAt = qdi.syncedAt;
    } catch {
      // segue
    }
    try {
      const r = await this.qdiDados.getByNf();
      dadosByNf = r.byNf;
      qdiSyncedAt = Math.max(qdiSyncedAt, r.syncedAt);
    } catch {
      // segue
    }
    return {
      items: mergeThreeSources(dadosByNf, qdiByNf, entry.byNf),
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
 * Merge 3-way (S6a/ADR-008): DADOS > 1ª1º > EFETIVO.
 *
 * - **DADOS** (aba LOCAL=1ª1º): primária — ANT, posto, nome, nomeGuerra, situação,
 *   classe, conceito disciplinar, CNH, incorporação, plano férias, mergulho, FTBA, etc.
 * - **1ª1º** (aba operacional do QDI): complementa subSecao/funcao/unidade/postoPrevisto;
 *   pode sobrescrever situacao/posto se mais atualizado.
 * - **EFETIVO**: fallback — preenche idade/serviço/município se ausentes nas anteriores.
 *
 * **Inclusão de NFs (default):** apenas militares presentes em DADOS
 * (com LOCAL=1ª1º) OU 1ª1º. EFETIVO é exclusivamente fonte de
 * **enriquecimento** — nunca adiciona novas NFs.
 * (Caso contrário, militares de outras unidades como CAP ALAN/TEN ALINE
 * apareceriam na lista da 1ª Cia só por estarem no EFETIVO geral.)
 *
 * **`incluirEfetivoOrfao=true` (S6c/F1):** NFs presentes apenas no EFETIVO
 * também aparecem. Usado pelo NomeMatcher da Prévia para resolver militares
 * de escalas que ainda não foram lançados no QDI 1ª1º.
 *
 * Cada militar carrega `origensFonte: string[]` indicando quais fontes contribuíram.
 */
function mergeThreeSources(
  dadosByNf: Map<string, MilitarDados>,
  qdiByNf: Map<string, MilitarQdi>,
  efetivoByNf: Map<string, Militar>,
  options: { incluirEfetivoOrfao?: boolean } = {},
): Militar[] {
  const allNfs = new Set<string>([...dadosByNf.keys(), ...qdiByNf.keys()]);
  if (options.incluirEfetivoOrfao) {
    for (const nf of efetivoByNf.keys()) allNfs.add(nf);
  }
  const result: Militar[] = [];

  for (const nf of allNfs) {
    const d = dadosByNf.get(nf);
    const q = qdiByNf.get(nf);
    const e = efetivoByNf.get(nf);

    const origens: ('DADOS' | '1ª1º' | 'EFETIVO')[] = [];
    if (d) origens.push('DADOS');
    if (q) origens.push('1ª1º');
    if (e) origens.push('EFETIVO');

    // Começa com EFETIVO como base (idade, serviço, município, situação inicial),
    // depois sobrescreve com QDI/1ª1º (operacional), depois com DADOS (mais detalhado e completo).
    let m: Militar = {
      nf,
      ant: 0,
      posto: '',
      nome: '',
      origensFonte: origens,
    };

    if (e) {
      m = { ...m, ...e };
    }
    if (q) {
      m = {
        ...m,
        ant: q.ant,
        posto: q.postoAtual,
        nome: m.nome || q.nomeGuerra,
        nomeGuerra: q.nomeGuerra,
        funcao: q.funcao,
        unidade: q.unidade,
        subSecao: q.subSecao,
        postoPrevisto: q.postoPrevisto,
        situacao: q.situacao ?? m.situacao,
      };
    }
    if (d) {
      m = {
        ...m,
        ant: d.ant, // DADOS é primária para ANT
        posto: d.posto, // DADOS é primária para posto atual
        nome: d.nome || m.nome,
        nomeGuerra: d.nomeGuerra ?? m.nomeGuerra,
        municipio: d.municipio ?? m.municipio,
        situacao: d.situacao ?? m.situacao,
        // Campos novos só vêm de DADOS:
        lotacao: d.lotacao,
        classe: d.classe,
        conceitoDisciplinar: d.conceitoDisciplinar,
        pontos: d.pontos,
        cnh: d.cnh,
        cnhValidade: d.cnhValidade,
        incorporacao: d.incorporacao,
        planoFerias: d.planoFerias,
        mergulho: d.mergulho,
        ftba: d.ftba,
        etsp: d.etsp,
        ccve: d.ccve,
        ccveValidade: d.ccveValidade,
        censo: d.censo,
      };
    }

    // Garante invariantes do schema
    if (!m.posto || !m.nome) continue;
    m.origensFonte = origens;
    result.push(m);
  }

  result.sort((a, b) => a.ant - b.ant);
  return result;
}

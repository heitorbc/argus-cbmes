import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Militar as PrismaMilitar } from '@prisma/client';
import type { EfetivoListResponse, EfetivoQuery, Militar } from '@argus/shared-types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ChefesOperacoesService } from '../chefes-operacoes/chefes-operacoes.service';
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
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(forwardRef(() => ChefesOperacoesService))
    private readonly chefesOperacoes?: ChefesOperacoesService,
  ) {}

  async list(query: EfetivoQuery): Promise<EfetivoListResponse> {
    // S2.10.13b — `incluirEfetivoOrfao=true` agora é o default na página
    // /cadastros/efetivo (multi-unidade): TODOS os militares do CBMES entram,
    // filtrados via dropdown de unidade no frontend.
    const consolidated = await this.consolidateFromDbOrMemory({ incluirEfetivoOrfao: true });

    let items = consolidated.items;

    // S2.10.13b — Filtro multi-unidade. `unidade` é o caminho preferido;
    // `somente1aCia` mantém retrocompat (vira `unidade='1ª1º'`).
    const unidadeFiltro = query.unidade ?? (query.somente1aCia ? '1ª1º' : undefined);
    if (unidadeFiltro) {
      // ChOps de outras unidades entram mesmo no filtro (são parte do
      // ecossistema operacional). Cf. comportamento anterior em S6a-fix item 2.
      items = items.filter((m) => m.unidade === unidadeFiltro || m.papelEspecial);
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
    const consolidated = await this.consolidateFromDbOrMemory({ incluirEfetivoOrfao: true });
    return consolidated.items.find((m) => m.nf === nf) ?? null;
  }

  /**
   * S2.10.13b — Lista de unidades distintas presentes em `prisma.militar`
   * (campo `unidade`). Usado pelo `<select>` de filtro no frontend.
   *
   * Postgres-first: leitura direta + DISTINCT é mais rápido que iterar
   * `consolidated.items`. Fallback para memória se Postgres vazio.
   */
  async listUnidades(): Promise<string[]> {
    try {
      const rows = await this.prisma.militar.findMany({
        where: { unidade: { not: null } },
        select: { unidade: true },
        distinct: ['unidade'],
        orderBy: { unidade: 'asc' },
      });
      const unidades = rows
        .map((r) => r.unidade)
        .filter((u): u is string => u !== null && u.trim() !== '');
      if (unidades.length > 0) return unidades;
    } catch (err) {
      this.logger.warn(`listUnidades Postgres falhou: ${(err as Error).message}`);
    }
    // Fallback memória: deriva da consolidação atual
    const consolidated = await this.consolidateFromDbOrMemory({ incluirEfetivoOrfao: true });
    const set = new Set<string>();
    for (const m of consolidated.items) {
      if (m.unidade) set.add(m.unidade);
    }
    return [...set].sort();
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
    const consolidated = await this.consolidateFromDbOrMemory({
      incluirEfetivoOrfao: options.incluirEfetivoOrfao,
    });
    if (options.somente1aCia) {
      return consolidated.items.filter((m) => m.subSecao !== undefined);
    }
    return consolidated.items;
  }

  /**
   * S2.10.8d — Tenta ler consolidação de `prisma.militar` (populado pelo
   * `MilitarConsolidatorService` via cron/manual sync). Fallback para
   * consolidação em memória se Postgres ainda vazio (cold boot, antes do
   * 1º sync rodar).
   *
   * Aplica `incluirEfetivoOrfao` em runtime: NFs com `origensFonte`
   * contendo apenas `'EFETIVO'` são filtradas quando `incluirEfetivoOrfao=false`.
   */
  private async consolidateFromDbOrMemory(
    options: { incluirEfetivoOrfao?: boolean } = {},
  ): Promise<{ items: Militar[]; syncedAt: number; stale: boolean }> {
    let count = 0;
    try {
      count = await this.prisma.militar.count();
    } catch (err) {
      this.logger.warn(
        `prisma.militar.count() falhou: ${(err as Error).message}. Caindo para consolidação em memória.`,
      );
    }
    if (count > 0) {
      const rows = await this.prisma.militar.findMany({ orderBy: { ant: 'asc' } });
      let items = rows.map(prismaMilitarToShared);
      if (!options.incluirEfetivoOrfao) {
        items = items.filter((m) => {
          const so = m.origensFonte ?? [];
          return so.includes('DADOS') || so.includes('1ª1º');
        });
      }
      const syncedAt = rows.reduce((acc, r) => Math.max(acc, r.sincronizadoEm.getTime()), 0);
      const stale = syncedAt > 0 && Date.now() - syncedAt >= CACHE_TTL_MS;
      return { items, syncedAt, stale };
    }
    // Fallback: tabela vazia (cold boot antes do 1º sync) → consolidação em memória.
    return this.consolidate({ incluirEfetivoOrfao: options.incluirEfetivoOrfao });
  }

  /**
   * S2.10.8d — Expõe o cache RAW da planilha EFETIVO (sem consolidação com
   * QDI/DADOS). Usado pelo `MilitarConsolidatorService` para evitar fetch
   * duplicado. Força refresh se TTL expirou.
   */
  async getRawEfetivoByNf(): Promise<{
    byNf: Map<string, Militar>;
    syncedAt: number;
    stale: boolean;
  }> {
    const { entry, stale } = await this.getEntry();
    return { byNf: entry.byNf, syncedAt: entry.syncedAt, stale };
  }

  /** S2.10.8d — Invalida cache do EFETIVO (próximo fetch força refresh). */
  invalidateRawCache(): void {
    this.cache = null;
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

    // S0.x/dev-fixes — Enriquece com ChOps habilitados:
    // 1. Marca papelEspecial='Chefe de Operações' nos militares já presentes.
    // 2. Para ChOps que não estão no efetivo da 1ª Cia (estão em outras Cias
    //    do BBM), busca em DADOS sem filtro de LOCAL e adiciona como entry
    //    extra com papelEspecial.
    if (this.chefesOperacoes) {
      const chopsNfs = await this.chefesOperacoes.getHabilitadosNfs();
      if (chopsNfs.size > 0) {
        const presentes = new Set(merged.map((m) => m.nf));
        for (const m of merged) {
          if (chopsNfs.has(m.nf)) m.papelEspecial = 'Chefe de Operações';
        }
        const ausentes = new Set([...chopsNfs].filter((nf) => !presentes.has(nf)));
        if (ausentes.size > 0) {
          const extras = await this.qdiDados.findUnfilteredByNfs(ausentes);
          for (const [nf, d] of extras) {
            merged.push({
              nf,
              ant: d.ant,
              posto: d.posto,
              nome: d.nome,
              nomeGuerra: d.nomeGuerra,
              lotacao: d.lotacao,
              municipio: d.municipio,
              situacao: d.situacao,
              origensFonte: ['DADOS'],
              papelEspecial: 'Chefe de Operações',
            });
          }
          merged.sort((a, b) => a.ant - b.ant);
        }
      }
    }

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
/**
 * S2.10.8d — Mapeia row do `prisma.militar` (null) para o shape do
 * shared-types `Militar` (undefined). Inverso de `militarToPrismaData` em
 * `militar-consolidator.service.ts`.
 */
function prismaMilitarToShared(row: PrismaMilitar): Militar {
  return {
    nf: row.nf,
    ant: row.ant,
    posto: row.posto,
    nome: row.nome,
    nomeGuerra: row.nomeGuerra ?? undefined,
    funcao: row.funcao ?? undefined,
    unidade: row.unidade ?? undefined,
    subSecao: (row.subSecao as 'staff' | 'sos' | 'guarda' | 'aquaticas' | null) ?? undefined,
    postoPrevisto: row.postoPrevisto ?? undefined,
    municipio: row.municipio ?? undefined,
    idade: row.idade ?? undefined,
    servico: row.servico ?? undefined,
    situacao: row.situacao ?? undefined,
    lotacao: row.lotacao ?? undefined,
    classe: row.classe ?? undefined,
    conceitoDisciplinar: row.conceitoDisciplinar ?? undefined,
    pontos: row.pontos ?? undefined,
    cnh: row.cnh ?? undefined,
    cnhValidade: row.cnhValidade ?? undefined,
    incorporacao: row.incorporacao ?? undefined,
    planoFerias: row.planoFerias ?? undefined,
    mergulho: row.mergulho ?? undefined,
    ftba: row.ftba ?? undefined,
    etsp: row.etsp ?? undefined,
    ccve: row.ccve ?? undefined,
    ccveValidade: row.ccveValidade ?? undefined,
    censo: row.censo ?? undefined,
    origensFonte: row.origensFonte as ('DADOS' | '1ª1º' | 'EFETIVO')[],
    papelEspecial: row.papelEspecial ?? undefined,
  };
}

export function mergeThreeSources(
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
        // S2.10.13b — quando só vem do DADOS (não está em QDI 1ª1º),
        // popula `unidade` a partir de `lotacao` (campo LOCAL da planilha).
        // Multi-unidade depende disso pra filtrar via dropdown no frontend.
        unidade: m.unidade ?? d.lotacao,
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

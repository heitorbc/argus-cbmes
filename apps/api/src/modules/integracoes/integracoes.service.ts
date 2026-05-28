import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { IntegracaoStatus } from '@argus/shared-types';
import { ChefesOperacoesService } from '../chefes-operacoes/chefes-operacoes.service';
import { DispensasImportService } from '../dispensas/dispensas-import.service';
import { EfetivoImportService } from '../efetivo/efetivo-import.service';
import { QdiDadosImportService } from '../efetivo/qdi-dados-import.service';
import { QdiImportService } from '../efetivo/qdi-import.service';
import { IseoHospitaisService } from '../iseo-hospitais/iseo-hospitais.service';
import { MapaForcaCiodesService } from '../mapa-forca-ciodes/mapa-forca-ciodes.service';
import { TrocasAutorizadasService } from '../trocas-autorizadas/trocas-autorizadas.service';
import { ViaturasQdvService } from '../viaturas/viaturas-qdv.service';
import { ViaturasQdvExtrasService } from '../viaturas/viaturas-qdv-extras.service';

interface SourceConfig {
  id: string;
  nome: string;
  descricao: string;
  sheetIdEnv: string;
  sheetIdDefault: string;
  sheetGidOrName?: string;
  /**
   * S2.10.8a — Source não persiste em Postgres; lê em tempo real (cache
   * 5min). Frontend mostra badge "⚡ Tempo-real" para alertar Tech Lead.
   */
  realtimeOnly?: boolean;
  /**
   * S2.10.8a — Source faz parte do scheduler central (cron 00/06/12/18h +
   * sync no startup). Frontend mostra ícone do scheduler.
   */
  noScheduler?: boolean;
  getStatus: () =>
    | { syncedAt: string | null; count: number; stale: boolean }
    | Promise<{ syncedAt: string | null; count: number; stale: boolean }>;
  forceSync: () => Promise<{ syncedAt: string; count: number }>;
}

/**
 * S0.5/PR2 + S2.10.8a — Lista todas as integrações Google Sheets ativas e seu
 * status de sync. Agrega os getters `getSyncStatus()` dos services com cache.
 *
 * S2.10.8a — Inclui TODAS as planilhas mapeadas (12 sources), com flags
 * `realtimeOnly` (não persiste — só cache 5min) e `noScheduler` (não está no
 * cron central). Decisão D2 do plano: MAPA FORÇA CIODES é realtimeOnly.
 */
@Injectable()
export class IntegracoesService {
  private readonly logger = new Logger(IntegracoesService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly trocasAut: TrocasAutorizadasService,
    private readonly chefesOp: ChefesOperacoesService,
    private readonly dispensasImport: DispensasImportService,
    private readonly viaturasQdv: ViaturasQdvService,
    private readonly viaturasQdvExtras: ViaturasQdvExtrasService,
    private readonly mapaForcaCiodes: MapaForcaCiodesService,
    private readonly iseoHospitais: IseoHospitaisService,
    // S2.10.8d — 3 ImportServices que compartilham o MilitarConsolidatorService.
    private readonly efetivoImport: EfetivoImportService,
    private readonly qdiImport: QdiImportService,
    private readonly qdiDadosImport: QdiDadosImportService,
  ) {}

  /**
   * S2.10.8c — async para suportar getStatus assíncrono (multi-sheet ISEO).
   */
  async list(): Promise<IntegracaoStatus[]> {
    return Promise.all(this.sources().map((s) => this.buildStatus(s)));
  }

  /**
   * S0.5/PR3 — Força resync da integração `id` ignorando o cache. Retorna
   * o status atualizado. Lança NotFoundException se `id` for desconhecido.
   */
  async sync(id: string): Promise<IntegracaoStatus> {
    const src = this.sources().find((s) => s.id === id);
    if (!src) throw new NotFoundException(`Integração '${id}' não encontrada`);
    await src.forceSync();
    return this.buildStatus(src);
  }

  private sources(): SourceConfig[] {
    return [
      // ── Persisted em Postgres + sync orchestrador ──────────────────────
      {
        id: 'dispensas-import',
        nome: 'Dispensas 2026 → Postgres (upsert)',
        descricao:
          'Importa dispensas da aba "Dispensas 2026" da planilha Efetivo - Dados Gerais e persiste em Postgres via upsert idempotente. Sync no startup, cron 00/06/12/18h e auto em GET /dispensas (cache 5min).',
        sheetIdEnv: 'DISPENSAS_PLANILHA_SHEET_ID',
        sheetIdDefault: '1gA17VKQNV8xlnqIhAJfu57TW1GS6VH2YDrcJZk405do',
        sheetGidOrName: 'gid=1986271842',
        getStatus: () => {
          const s = this.dispensasImport.getSyncStatus();
          const total = s.counts ? s.counts.created + s.counts.updated : 0;
          return { syncedAt: s.syncedAt, count: total, stale: s.stale };
        },
        forceSync: async () => {
          const r = await this.dispensasImport.forceSync();
          return { syncedAt: r.syncedAt, count: r.created + r.updated };
        },
      },
      // S2.10.8d — 3 sources que consolidam a tabela `militares` via
      // MilitarConsolidatorService (inflight lock compartilhado). Sincronizar
      // qualquer uma das 3 reconsolida todo o efetivo.
      {
        id: 'efetivo-import',
        nome: 'EFETIVO (Sargenteante) → Postgres (upsert consolidado)',
        descricao:
          'Sincroniza a planilha EFETIVO (Sargenteante) com a tabela militares no Postgres. Reconsolida 3-way com QDI 1ª1º + QDI/DADOS via inflight lock. Sync no startup + cron 00/06/12/18h.',
        sheetIdEnv: 'GOOGLE_SHEET_ID_EFETIVO',
        sheetIdDefault: '',
        sheetGidOrName: 'gid=1379090962',
        getStatus: () => {
          const s = this.efetivoImport.getSyncStatus();
          const total = s.counts ? s.counts.created + s.counts.updated : 0;
          return { syncedAt: s.syncedAt, count: total, stale: s.stale };
        },
        forceSync: async () => {
          const r = await this.efetivoImport.forceSync();
          return { syncedAt: r.syncedAt, count: r.created + r.updated };
        },
      },
      {
        id: 'qdi-import',
        nome: 'QDI 1ª1º → Postgres (upsert consolidado)',
        descricao:
          'Sincroniza a aba QDI 1ª1º com a tabela militares no Postgres via MilitarConsolidatorService (3-way merge com EFETIVO + DADOS). Inflight lock garante consolidação única quando syncAll roda em paralelo.',
        sheetIdEnv: 'GOOGLE_SHEET_ID_QDI',
        sheetIdDefault: '12-XCsNwr34d625Wkkuq-mr4bmv2Fcr2QQ1C7WfVjwB0',
        sheetGidOrName: 'gid=558859373',
        getStatus: () => {
          const s = this.qdiImport.getSyncStatus();
          const total = s.counts ? s.counts.created + s.counts.updated : 0;
          return { syncedAt: s.syncedAt, count: total, stale: s.stale };
        },
        forceSync: async () => {
          const r = await this.qdiImport.forceSync();
          return { syncedAt: r.syncedAt, count: r.created + r.updated };
        },
      },
      {
        id: 'qdi-dados-import',
        nome: 'QDI/DADOS → Postgres (upsert consolidado)',
        descricao:
          'Sincroniza a aba QDI/DADOS (fonte primária do consolidador, conforme ADR-008) com a tabela militares no Postgres via MilitarConsolidatorService.',
        sheetIdEnv: 'GOOGLE_SHEET_ID_QDI',
        sheetIdDefault: '12-XCsNwr34d625Wkkuq-mr4bmv2Fcr2QQ1C7WfVjwB0',
        sheetGidOrName: 'gid=1395786516',
        getStatus: () => {
          const s = this.qdiDadosImport.getSyncStatus();
          const total = s.counts ? s.counts.created + s.counts.updated : 0;
          return { syncedAt: s.syncedAt, count: total, stale: s.stale };
        },
        forceSync: async () => {
          const r = await this.qdiDadosImport.forceSync();
          return { syncedAt: r.syncedAt, count: r.created + r.updated };
        },
      },

      // ── Real-time only (cache 5min, sem persistência em Postgres) ──────
      {
        id: 'mapa-forca-ciodes',
        nome: 'Mapa Força CIODES — 1º BBM',
        descricao:
          'Planilha colaborativa de recursos operacionais do 1º BBM. Alta frequência de atualização direta na planilha — mantida em tempo real (sem persistência local).',
        sheetIdEnv: 'GOOGLE_SHEET_ID_MAPA_FORCA',
        sheetIdDefault: '1EWuQwuPBkihzrNQ4OGo9AIibbdBK-el1KHMHo71BVCc',
        sheetGidOrName: 'gid=1468029336',
        realtimeOnly: true,
        noScheduler: true,
        getStatus: () => this.mapaForcaCiodes.getSyncStatus(),
        forceSync: () => this.mapaForcaCiodes.forceSyncAsSource(),
      },
      {
        // S2.10.8b — Trocas Autorizadas agora persistidas em Postgres + sync
        // orchestrator. listAll/listByData lêem direto de prisma.trocaAutorizada.
        id: 'trocas-autorizadas',
        nome: 'Trocas Autorizadas → Postgres (upsert)',
        descricao:
          'Planilha institucional de trocas autorizadas pelo Comando. Sincronizada no startup, cron 00/06/12/18h e auto em cada GET (cache 5min). Persiste em Postgres via upsert idempotente por hash da linha.',
        sheetIdEnv: 'TROCAS_AUT_SHEET_ID',
        sheetIdDefault: '1IjD4XskscfL5w4bCw5lP5qTNIZi5307XJKc3yGWK4D8',
        sheetGidOrName: 'gid=1799360305',
        getStatus: () => this.trocasAut.getSyncStatus(),
        forceSync: () => this.trocasAut.forceSync(),
      },
      {
        // S2.10.9a — ChOp agora persistido em Postgres + sync orchestrator.
        // Substitui o cache in-memory anterior (pattern S2.10.8d/c).
        id: 'chefes-operacoes',
        nome: 'Chefes de Operações → Postgres (replace-all)',
        descricao:
          'Escala mensal de Chefes de Operações da 1ª Cia/1º BBM. Sincronizada no startup, cron 00/06/12/18h e botão manual. Replace-all: cada sync apaga o estado anterior do mês corrente.',
        sheetIdEnv: 'CHOP_SHEET_ID',
        sheetIdDefault: '1Nlr_uSNVD6dByaWPTL6IttSOa2nQPXO-m7FqTpeH8WI',
        sheetGidOrName: 'gid=1250546399',
        getStatus: () => this.chefesOp.getSyncStatus(),
        forceSync: () => this.chefesOp.forceSync(),
      },
      {
        // S2.10.8c — ISEO Hospitais agora persistido em Postgres + sync orchestrator.
        // Multi-sheet (HPM + HIMABA × meses) agregado num único SyncLog.
        id: 'iseo-hospitais',
        nome: 'ISEO Hospitais → Postgres (upsert multi-sheet)',
        descricao:
          'Escala mensal ISEO Hospitais — várias abas (HPM/HIMABA × meses) sincronizadas e persistidas em Postgres. Sync no startup, cron 00/06/12/18h e auto em cada GET (cache 5min).',
        sheetIdEnv: 'ISEO_HOSPITAIS_SHEET_ID',
        sheetIdDefault: '1wmFOEsrU219fGMfksoSY5dvQu0UN7HdQ558UUiWRXuw',
        sheetGidOrName: 'gid=1108098049',
        getStatus: async () => this.iseoHospitais.getSyncStatusAgregado(),
        forceSync: () => this.iseoHospitais.forceSyncAsSource(),
      },

      // ── QDV (multi-sheet → Postgres em S2.10.9a) ───────────────────────
      // As 4 entries compartilham o ViaturasQdvImportService; forceSync de
      // qualquer uma sincroniza todas as 4 abas (replace-all multi-sheet).
      {
        id: 'viaturas-qdv',
        nome: 'QDV — Viaturas 1BBM/1ªCia → Postgres',
        descricao:
          'Quadro Demonstrativo de Viaturas, aba 1BBM_1CIA. Sincronizada com prisma.viaturaQdv via cron 00/06/12/18h + startup + botão manual.',
        sheetIdEnv: 'QDV_SHEET_ID',
        sheetIdDefault: '1iqjSDXpbAjtbi7lvd5_5brims8Ipr-OTVXhQMGiv2I8',
        sheetGidOrName: '1BBM_1CIA',
        getStatus: () => this.viaturasQdv.getSyncStatus(),
        forceSync: () => this.viaturasQdv.forceSync(),
      },
      {
        id: 'viaturas-qdv-base-lista',
        nome: 'QDV — BASE_LISTA → Postgres',
        descricao:
          'Cadastro mestre detalhado das viaturas por OBM. Persistido em prisma.viaturaQdvBaseLista (multi-sheet sync compartilhado).',
        sheetIdEnv: 'QDV_SHEET_ID',
        sheetIdDefault: '1iqjSDXpbAjtbi7lvd5_5brims8Ipr-OTVXhQMGiv2I8',
        sheetGidOrName: 'BASE_LISTA',
        getStatus: async () => this.viaturasQdvExtras.getSyncStatusBaseLista(),
        forceSync: () => this.viaturasQdvExtras.forceSyncBaseLista(),
      },
      {
        id: 'viaturas-qdv-cbmes',
        nome: 'QDV — Lista Principal CBMES → Postgres',
        descricao:
          'TODAS as viaturas do CBMES (aba BASE_VTR_LISTA_PRINCIPAL). Persistido em prisma.viaturaCbmes (multi-sheet sync compartilhado).',
        sheetIdEnv: 'QDV_SHEET_ID',
        sheetIdDefault: '1iqjSDXpbAjtbi7lvd5_5brims8Ipr-OTVXhQMGiv2I8',
        sheetGidOrName: 'BASE_VTR_LISTA_PRINCIPAL',
        getStatus: async () => this.viaturasQdvExtras.getSyncStatusVtrPrincipal(),
        forceSync: () => this.viaturasQdvExtras.forceSyncVtrPrincipal(),
      },
      {
        id: 'viaturas-qdv-contatos',
        nome: 'QDV — Contatos Logísticos → Postgres',
        descricao:
          'Responsável logístico por OBM (aba Contatos_LOGISTICAS). Persistido em prisma.contatoLogistico (multi-sheet sync compartilhado).',
        sheetIdEnv: 'QDV_SHEET_ID',
        sheetIdDefault: '1iqjSDXpbAjtbi7lvd5_5brims8Ipr-OTVXhQMGiv2I8',
        sheetGidOrName: 'Contatos_LOGISTICAS',
        getStatus: async () => this.viaturasQdvExtras.getSyncStatusContatos(),
        forceSync: () => this.viaturasQdvExtras.forceSyncContatos(),
      },

      // S2.10.14a — Sheets-DB totalmente removido como dependência runtime.
      // Postgres é fonte canônica desde S2.10.5 (dual-write encerrado em
      // S2.10.9d; fallback bootstrap removido em S2.10.14a). Única integração
      // runtime com planilha Google restante: MapaForcaCiodes (real-time CSV).
    ];
  }

  private async buildStatus(s: SourceConfig): Promise<IntegracaoStatus> {
    const sheetId = this.config.get<string>(s.sheetIdEnv) ?? s.sheetIdDefault;
    const url = sheetId
      ? s.sheetGidOrName
        ? `https://docs.google.com/spreadsheets/d/${sheetId}/edit#${s.sheetGidOrName}`
        : `https://docs.google.com/spreadsheets/d/${sheetId}/edit`
      : '';
    // S2.10.8c-fix — Isola falha de 1 source para não derrubar a lista
    // inteira via Promise.all em list(). Cold boot do Supabase pode falhar
    // queries como prisma.iseoHospitalEntry.count() (getSyncStatusAgregado);
    // sem este try/catch, a exceção sobe → HTTP 500 no menu inteiro.
    let status: { syncedAt: string | null; count: number; stale: boolean };
    try {
      status = await s.getStatus();
    } catch (err) {
      this.logger.warn(
        `getStatus de '${s.id}' falhou (${(err as Error).message}). Exibindo como 'nunca'.`,
      );
      status = { syncedAt: null, count: 0, stale: false };
    }
    let statusLabel: IntegracaoStatus['status'];
    if (status.syncedAt === null) statusLabel = 'nunca';
    else if (status.stale) statusLabel = 'stale';
    else statusLabel = 'ok';
    return {
      id: s.id,
      nome: s.nome,
      descricao: s.descricao,
      url,
      ultimoSyncEm: status.syncedAt,
      qtdRegistros: status.count,
      status: statusLabel,
      realtimeOnly: s.realtimeOnly ?? false,
      noScheduler: s.noScheduler ?? false,
    };
  }
}

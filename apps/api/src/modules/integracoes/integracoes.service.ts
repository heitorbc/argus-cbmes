import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { IntegracaoStatus } from '@argus/shared-types';
import { ChefesOperacoesService } from '../chefes-operacoes/chefes-operacoes.service';
import { DispensasImportService } from '../dispensas/dispensas-import.service';
import { DispensasSheetService } from '../dispensas/dispensas-sheet.service';
import { QdiService } from '../efetivo/qdi.service';
import { QdiDadosService } from '../efetivo/qdi-dados.service';
import { IseoHospitaisService } from '../iseo-hospitais/iseo-hospitais.service';
import { MapaForcaCiodesService } from '../mapa-forca-ciodes/mapa-forca-ciodes.service';
import { SheetsDbService } from '../sheets-db/sheets-db.service';
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
  constructor(
    private readonly config: ConfigService,
    private readonly trocasAut: TrocasAutorizadasService,
    private readonly chefesOp: ChefesOperacoesService,
    private readonly dispensasSheet: DispensasSheetService,
    private readonly dispensasImport: DispensasImportService,
    private readonly viaturasQdv: ViaturasQdvService,
    private readonly viaturasQdvExtras: ViaturasQdvExtrasService,
    private readonly qdi: QdiService,
    private readonly qdiDados: QdiDadosService,
    private readonly mapaForcaCiodes: MapaForcaCiodesService,
    private readonly iseoHospitais: IseoHospitaisService,
    private readonly sheetsDb: SheetsDbService,
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
        id: 'chefes-operacoes',
        nome: 'Chefes de Operações (ChOp)',
        descricao: 'Escala de Chefes de Operações da 1ª Cia/1º BBM.',
        sheetIdEnv: 'CHOP_SHEET_ID',
        sheetIdDefault: '1Nlr_uSNVD6dByaWPTL6IttSOa2nQPXO-m7FqTpeH8WI',
        sheetGidOrName: 'gid=1250546399',
        realtimeOnly: true,
        noScheduler: true,
        getStatus: () => this.chefesOp.getSyncStatus(),
        forceSync: () => this.chefesOp.forceSync(),
      },
      {
        id: 'qdi-1a1o',
        nome: 'QDI — aba "1ª1º" (operacional)',
        descricao:
          'Quadro de Distribuição Interna do 1º BBM (aba operacional 1ª Cia). Fonte primária de NF/posto/nome de guerra dos militares.',
        sheetIdEnv: 'GOOGLE_SHEET_ID_QDI',
        sheetIdDefault: '12-XCsNwr34d625Wkkuq-mr4bmv2Fcr2QQ1C7WfVjwB0',
        sheetGidOrName: 'gid=558859373',
        realtimeOnly: true,
        noScheduler: true,
        getStatus: () => this.qdi.getSyncStatus(),
        forceSync: () => this.qdi.forceSync(),
      },
      {
        id: 'qdi-dados',
        nome: 'QDI — aba "DADOS"',
        descricao:
          'Aba DADOS do QDI com lotação canônica (LOCAL=1ª1º). Fonte primária para ChOps de outras Cias.',
        sheetIdEnv: 'GOOGLE_SHEET_ID_QDI',
        sheetIdDefault: '12-XCsNwr34d625Wkkuq-mr4bmv2Fcr2QQ1C7WfVjwB0',
        sheetGidOrName: 'gid=1395786516',
        realtimeOnly: true,
        noScheduler: true,
        getStatus: () => this.qdiDados.getSyncStatus(),
        forceSync: () => this.qdiDados.forceSync(),
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
      {
        id: 'dispensas-sheet',
        nome: 'Dispensas 2026 — leitura raw',
        descricao:
          'Mesma aba "Dispensas 2026" lida em formato raw (sem upsert). Usada por /dispensas/sheet para conferência manual.',
        sheetIdEnv: 'DISPENSAS_SHEET_ID',
        sheetIdDefault: '1gA17VKQNV8xlnqIhAJfu57TW1GS6VH2YDrcJZk405do',
        sheetGidOrName: 'Dispensas%202026',
        realtimeOnly: true,
        noScheduler: true,
        getStatus: () => this.dispensasSheet.getSyncStatus(),
        forceSync: () => this.dispensasSheet.forceSync(),
      },

      // ── QDV (real-time + cache) ────────────────────────────────────────
      {
        id: 'viaturas-qdv',
        nome: 'QDV — Viaturas 1BBM/1ªCia',
        descricao: 'Quadro Demonstrativo de Viaturas (aba 1BBM_1CIA).',
        sheetIdEnv: 'QDV_SHEET_ID',
        sheetIdDefault: '1iqjSDXpbAjtbi7lvd5_5brims8Ipr-OTVXhQMGiv2I8',
        sheetGidOrName: '1BBM_1CIA',
        realtimeOnly: true,
        noScheduler: true,
        getStatus: () => this.viaturasQdv.getSyncStatus(),
        forceSync: () => this.viaturasQdv.forceSync(),
      },
      {
        id: 'viaturas-qdv-base-lista',
        nome: 'QDV — BASE_LISTA',
        descricao: 'Cadastro mestre detalhado das viaturas por OBM.',
        sheetIdEnv: 'QDV_SHEET_ID',
        sheetIdDefault: '1iqjSDXpbAjtbi7lvd5_5brims8Ipr-OTVXhQMGiv2I8',
        sheetGidOrName: 'BASE_LISTA',
        realtimeOnly: true,
        noScheduler: true,
        getStatus: () => this.viaturasQdvExtras.getSyncStatusBaseLista(),
        forceSync: () => this.viaturasQdvExtras.forceSyncBaseLista(),
      },
      {
        id: 'viaturas-qdv-cbmes',
        nome: 'QDV — Lista Principal CBMES',
        descricao: 'TODAS as viaturas do CBMES (aba BASE_VTR_LISTA_PRINCIPAL).',
        sheetIdEnv: 'QDV_SHEET_ID',
        sheetIdDefault: '1iqjSDXpbAjtbi7lvd5_5brims8Ipr-OTVXhQMGiv2I8',
        sheetGidOrName: 'BASE_VTR_LISTA_PRINCIPAL',
        realtimeOnly: true,
        noScheduler: true,
        getStatus: () => this.viaturasQdvExtras.getSyncStatusVtrPrincipal(),
        forceSync: () => this.viaturasQdvExtras.forceSyncVtrPrincipal(),
      },
      {
        id: 'viaturas-qdv-contatos',
        nome: 'QDV — Contatos Logísticos',
        descricao: 'Responsável logístico por OBM (aba Contatos_LOGISTICAS).',
        sheetIdEnv: 'QDV_SHEET_ID',
        sheetIdDefault: '1iqjSDXpbAjtbi7lvd5_5brims8Ipr-OTVXhQMGiv2I8',
        sheetGidOrName: 'Contatos_LOGISTICAS',
        realtimeOnly: true,
        noScheduler: true,
        getStatus: () => this.viaturasQdvExtras.getSyncStatusContatos(),
        forceSync: () => this.viaturasQdvExtras.forceSyncContatos(),
      },

      // ── Sheets-DB (dual-write, escrita via SA) ─────────────────────────
      {
        id: 'sheets-db',
        nome: 'BD_ARGUS_CBMES_HOM (Sheets-DB)',
        descricao:
          'Planilha-DB institucional (espelho Drive) — dual-write das tabelas operacionais (escalas mensais, escalas especiais, notas de serviço). Bootstrap único no startup; sync = refazer bootstrap.',
        sheetIdEnv: 'SHEETS_DB_ID',
        sheetIdDefault: '',
        realtimeOnly: true,
        noScheduler: true,
        getStatus: () => this.sheetsDb.getSyncStatusAsSource(),
        forceSync: () => this.sheetsDb.forceSyncAsSource(),
      },
    ];
  }

  private async buildStatus(s: SourceConfig): Promise<IntegracaoStatus> {
    const sheetId = this.config.get<string>(s.sheetIdEnv) ?? s.sheetIdDefault;
    const status = await s.getStatus();
    const url = sheetId
      ? s.sheetGidOrName
        ? `https://docs.google.com/spreadsheets/d/${sheetId}/edit#${s.sheetGidOrName}`
        : `https://docs.google.com/spreadsheets/d/${sheetId}/edit`
      : '';
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

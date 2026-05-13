import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { IntegracaoStatus } from '@argus/shared-types';
import { ChefesOperacoesService } from '../chefes-operacoes/chefes-operacoes.service';
import { DispensasSheetService } from '../dispensas/dispensas-sheet.service';
import { TrocasAutorizadasService } from '../trocas-autorizadas/trocas-autorizadas.service';
import { ViaturasQdvService } from '../viaturas/viaturas-qdv.service';

interface SourceConfig {
  id: string;
  nome: string;
  descricao: string;
  sheetIdEnv: string;
  sheetIdDefault: string;
  sheetGidOrName?: string;
  getStatus: () => { syncedAt: string | null; count: number; stale: boolean };
  forceSync: () => Promise<{ syncedAt: string; count: number }>;
}

/**
 * S0.5/PR2 — Lista todas as integrações Google Sheets ativas e seu status
 * de sync (read-only). Agrega os getters `getSyncStatus()` dos services
 * com cache.
 */
@Injectable()
export class IntegracoesService {
  constructor(
    private readonly config: ConfigService,
    private readonly trocasAut: TrocasAutorizadasService,
    private readonly chefesOp: ChefesOperacoesService,
    private readonly dispensasSheet: DispensasSheetService,
    private readonly viaturasQdv: ViaturasQdvService,
  ) {}

  list(): IntegracaoStatus[] {
    return this.sources().map((s) => this.buildStatus(s));
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
      {
        id: 'trocas-autorizadas',
        nome: 'Trocas Autorizadas',
        descricao:
          'Planilha institucional de trocas autorizadas pelo Comando — alimenta automaticamente as trocas de serviço da Prévia/PD.',
        sheetIdEnv: 'TROCAS_AUT_SHEET_ID',
        sheetIdDefault: '1IjD4XskscfL5w4bCw5lP5qTNIZi5307XJKc3yGWK4D8',
        sheetGidOrName: 'gid=1799360305',
        getStatus: () => this.trocasAut.getSyncStatus(),
        forceSync: () => this.trocasAut.forceSync(),
      },
      {
        id: 'chefes-operacoes',
        nome: 'Chefes de Operações',
        descricao: 'Escala de Chefes de Operações da 1ª Cia/1º BBM.',
        sheetIdEnv: 'CHOP_SHEET_ID',
        sheetIdDefault: '1Nlr_uSNVD6dByaWPTL6IttSOa2nQPXO-m7FqTpeH8WI',
        sheetGidOrName: 'gid=1250546399',
        getStatus: () => this.chefesOp.getSyncStatus(),
        forceSync: () => this.chefesOp.forceSync(),
      },
      {
        id: 'dispensas-sheet',
        nome: 'Dispensas 2026 (Efetivo)',
        descricao:
          'Aba "Dispensas 2026" da planilha Efetivo - Dados Gerais. Histórico institucional de dispensas concedidas.',
        sheetIdEnv: 'DISPENSAS_SHEET_ID',
        sheetIdDefault: '1gA17VKQNV8xlnqIhAJfu57TW1GS6VH2YDrcJZk405do',
        sheetGidOrName: 'Dispensas%202026',
        getStatus: () => this.dispensasSheet.getSyncStatus(),
        forceSync: () => this.dispensasSheet.forceSync(),
      },
      {
        id: 'viaturas-qdv',
        nome: 'QDV — Viaturas 1BBM/1ªCia',
        descricao: 'Quadro Demonstrativo de Viaturas (aba 1BBM_1CIA).',
        sheetIdEnv: 'QDV_SHEET_ID',
        sheetIdDefault: '1iqjSDXpbAjtbi7lvd5_5brims8Ipr-OTVXhQMGiv2I8',
        sheetGidOrName: '1BBM_1CIA',
        getStatus: () => this.viaturasQdv.getSyncStatus(),
        forceSync: () => this.viaturasQdv.forceSync(),
      },
    ];
  }

  private buildStatus(s: SourceConfig): IntegracaoStatus {
    const sheetId = this.config.get<string>(s.sheetIdEnv) ?? s.sheetIdDefault;
    const status = s.getStatus();
    const url = s.sheetGidOrName
      ? `https://docs.google.com/spreadsheets/d/${sheetId}/edit#${s.sheetGidOrName}`
      : `https://docs.google.com/spreadsheets/d/${sheetId}/edit`;
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
    };
  }
}

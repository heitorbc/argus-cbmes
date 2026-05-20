import { Module } from '@nestjs/common';
import { ChefesOperacoesModule } from '../chefes-operacoes/chefes-operacoes.module';
import { ChefesOperacoesImportService } from '../chefes-operacoes/chefes-operacoes-import.service';
import { DispensasModule } from '../dispensas/dispensas.module';
import { DispensasImportService } from '../dispensas/dispensas-import.service';
import { EfetivoModule } from '../efetivo/efetivo.module';
import { EfetivoImportService } from '../efetivo/efetivo-import.service';
import { QdiDadosImportService } from '../efetivo/qdi-dados-import.service';
import { QdiImportService } from '../efetivo/qdi-import.service';
import { IseoHospitaisModule } from '../iseo-hospitais/iseo-hospitais.module';
import { IseoHospitaisImportService } from '../iseo-hospitais/iseo-hospitais-import.service';
import { TrocasAutorizadasModule } from '../trocas-autorizadas/trocas-autorizadas.module';
import { TrocasAutorizadasImportService } from '../trocas-autorizadas/trocas-autorizadas-import.service';
import { ViaturasModule } from '../viaturas/viaturas.module';
import { ViaturasQdvImportService } from '../viaturas/viaturas-qdv-import.service';
import {
  SYNC_SOURCES,
  SyncOrchestratorService,
  type SyncSource,
} from './sync-orchestrator.service';

/**
 * S2.10.8a–S2.10.9a — Módulo central do scheduler de sincronizações.
 *
 * Fornece a lista `SYNC_SOURCES` consumida pelo `SyncOrchestratorService`.
 *
 * S2.10.8a: +DispensasImportService
 * S2.10.8b: +TrocasAutorizadasImportService
 * S2.10.8c: +IseoHospitaisImportService (multi-sheet)
 * S2.10.8d: +EfetivoImportService, +QdiImportService, +QdiDadosImportService
 *           (3 sources que compartilham o `MilitarConsolidatorService`)
 * S2.10.9a: +ChefesOperacoesImportService, +ViaturasQdvImportService
 *           (QDV é multi-sheet: 1BBM_1CIA + BASE_LISTA + BASE_VTR + Contatos)
 *
 * Total: **8 sources persistentes** + 1 real-time (MF CIODES, decisão D2).
 */
@Module({
  imports: [
    DispensasModule,
    IseoHospitaisModule,
    TrocasAutorizadasModule,
    EfetivoModule,
    ChefesOperacoesModule,
    ViaturasModule,
  ],
  providers: [
    SyncOrchestratorService,
    {
      provide: SYNC_SOURCES,
      // MAPA FORÇA CIODES é EXCLUÍDO por decisão D2 (mantém real-time).
      useFactory: (
        dispensas: DispensasImportService,
        trocas: TrocasAutorizadasImportService,
        iseo: IseoHospitaisImportService,
        efetivo: EfetivoImportService,
        qdi: QdiImportService,
        qdiDados: QdiDadosImportService,
        chop: ChefesOperacoesImportService,
        qdv: ViaturasQdvImportService,
      ): SyncSource[] => [dispensas, trocas, iseo, efetivo, qdi, qdiDados, chop, qdv],
      inject: [
        DispensasImportService,
        TrocasAutorizadasImportService,
        IseoHospitaisImportService,
        EfetivoImportService,
        QdiImportService,
        QdiDadosImportService,
        ChefesOperacoesImportService,
        ViaturasQdvImportService,
      ],
    },
  ],
  exports: [SyncOrchestratorService],
})
export class SyncOrchestratorModule {}

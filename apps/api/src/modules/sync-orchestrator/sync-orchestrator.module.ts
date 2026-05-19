import { Module } from '@nestjs/common';
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
import {
  SYNC_SOURCES,
  SyncOrchestratorService,
  type SyncSource,
} from './sync-orchestrator.service';

/**
 * S2.10.8a/b/c/d — Módulo central do scheduler de sincronizações.
 *
 * Fornece a lista `SYNC_SOURCES` consumida pelo `SyncOrchestratorService`.
 *
 * S2.10.8a: +DispensasImportService
 * S2.10.8b: +TrocasAutorizadasImportService
 * S2.10.8c: +IseoHospitaisImportService (multi-sheet)
 * S2.10.8d: +EfetivoImportService, +QdiImportService, +QdiDadosImportService
 *           (3 sources que compartilham o `MilitarConsolidatorService`)
 *
 * Total: 6 sources persistentes + 3 read-only (MF CIODES, Sheets-DB, ChOp).
 */
@Module({
  imports: [DispensasModule, IseoHospitaisModule, TrocasAutorizadasModule, EfetivoModule],
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
      ): SyncSource[] => [dispensas, trocas, iseo, efetivo, qdi, qdiDados],
      inject: [
        DispensasImportService,
        TrocasAutorizadasImportService,
        IseoHospitaisImportService,
        EfetivoImportService,
        QdiImportService,
        QdiDadosImportService,
      ],
    },
  ],
  exports: [SyncOrchestratorService],
})
export class SyncOrchestratorModule {}

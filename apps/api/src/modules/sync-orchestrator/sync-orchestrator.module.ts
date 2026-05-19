import { Module } from '@nestjs/common';
import { DispensasModule } from '../dispensas/dispensas.module';
import { DispensasImportService } from '../dispensas/dispensas-import.service';
import { TrocasAutorizadasModule } from '../trocas-autorizadas/trocas-autorizadas.module';
import { TrocasAutorizadasImportService } from '../trocas-autorizadas/trocas-autorizadas-import.service';
import {
  SYNC_SOURCES,
  SyncOrchestratorService,
  type SyncSource,
} from './sync-orchestrator.service';

/**
 * S2.10.8a/b — Módulo central do scheduler de sincronizações.
 *
 * Fornece a lista `SYNC_SOURCES` consumida pelo `SyncOrchestratorService`.
 * Novas sources (S2.10.8c ISEO, S2.10.8d Militar) serão adicionadas aqui
 * conforme cada sprint.
 *
 * S2.10.8b: +TrocasAutorizadasImportService
 */
@Module({
  imports: [DispensasModule, TrocasAutorizadasModule],
  providers: [
    SyncOrchestratorService,
    {
      provide: SYNC_SOURCES,
      // MAPA FORÇA CIODES é EXCLUÍDO por decisão D2 (mantém real-time).
      useFactory: (
        dispensas: DispensasImportService,
        trocas: TrocasAutorizadasImportService,
      ): SyncSource[] => [dispensas, trocas],
      inject: [DispensasImportService, TrocasAutorizadasImportService],
    },
  ],
  exports: [SyncOrchestratorService],
})
export class SyncOrchestratorModule {}

import { Module } from '@nestjs/common';
import { DispensasModule } from '../dispensas/dispensas.module';
import { DispensasImportService } from '../dispensas/dispensas-import.service';
import {
  SYNC_SOURCES,
  SyncOrchestratorService,
  type SyncSource,
} from './sync-orchestrator.service';

/**
 * S2.10.8a — Módulo central do scheduler de sincronizações.
 *
 * Fornece a lista `SYNC_SOURCES` consumida pelo `SyncOrchestratorService`.
 * Novas sources (S2.10.8b TrocasAutorizadas, S2.10.8c ISEO, S2.10.8d
 * Militar) serão adicionadas aqui conforme cada sprint.
 */
@Module({
  imports: [DispensasModule],
  providers: [
    SyncOrchestratorService,
    {
      provide: SYNC_SOURCES,
      // S2.10.8a — Por enquanto só Dispensas. As próximas sprints expandem.
      // MAPA FORÇA CIODES é EXCLUÍDO por decisão D2 (mantém real-time).
      useFactory: (dispensas: DispensasImportService): SyncSource[] => [dispensas],
      inject: [DispensasImportService],
    },
  ],
  exports: [SyncOrchestratorService],
})
export class SyncOrchestratorModule {}

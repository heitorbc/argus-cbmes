import { Module } from '@nestjs/common';
import { DispensasModule } from '../dispensas/dispensas.module';
import { DispensasImportService } from '../dispensas/dispensas-import.service';
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
 * S2.10.8a/b/c — Módulo central do scheduler de sincronizações.
 *
 * Fornece a lista `SYNC_SOURCES` consumida pelo `SyncOrchestratorService`.
 *
 * S2.10.8a: +DispensasImportService
 * S2.10.8b: +TrocasAutorizadasImportService
 * S2.10.8c: +IseoHospitaisImportService (multi-sheet)
 *
 * Próxima sprint (S2.10.8d): Militar (Efetivo + QDI + QDI-DADOS) — 3 sources.
 */
@Module({
  imports: [DispensasModule, IseoHospitaisModule, TrocasAutorizadasModule],
  providers: [
    SyncOrchestratorService,
    {
      provide: SYNC_SOURCES,
      // MAPA FORÇA CIODES é EXCLUÍDO por decisão D2 (mantém real-time).
      useFactory: (
        dispensas: DispensasImportService,
        trocas: TrocasAutorizadasImportService,
        iseo: IseoHospitaisImportService,
      ): SyncSource[] => [dispensas, trocas, iseo],
      inject: [DispensasImportService, TrocasAutorizadasImportService, IseoHospitaisImportService],
    },
  ],
  exports: [SyncOrchestratorService],
})
export class SyncOrchestratorModule {}

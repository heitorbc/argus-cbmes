import { Module } from '@nestjs/common';
import { ChefesOperacoesModule } from '../chefes-operacoes/chefes-operacoes.module';
import { DispensasModule } from '../dispensas/dispensas.module';
import { EfetivoModule } from '../efetivo/efetivo.module';
import { IseoHospitaisModule } from '../iseo-hospitais/iseo-hospitais.module';
import { MapaForcaCiodesModule } from '../mapa-forca-ciodes/mapa-forca-ciodes.module';
import { SheetsDbModule } from '../sheets-db/sheets-db.module';
import { SyncOrchestratorModule } from '../sync-orchestrator/sync-orchestrator.module';
import { TrocasAutorizadasModule } from '../trocas-autorizadas/trocas-autorizadas.module';
import { ViaturasModule } from '../viaturas/viaturas.module';
import { IntegracoesController } from './integracoes.controller';
import { IntegracoesService } from './integracoes.service';

@Module({
  imports: [
    ChefesOperacoesModule,
    DispensasModule,
    EfetivoModule,
    IseoHospitaisModule,
    MapaForcaCiodesModule,
    SheetsDbModule,
    SyncOrchestratorModule,
    TrocasAutorizadasModule,
    ViaturasModule,
  ],
  controllers: [IntegracoesController],
  providers: [IntegracoesService],
  exports: [IntegracoesService],
})
export class IntegracoesModule {}

import { forwardRef, Module } from '@nestjs/common';
import { ChefesOperacoesModule } from '../chefes-operacoes/chefes-operacoes.module';
import { EfetivoController } from './efetivo.controller';
import { EfetivoImportService } from './efetivo-import.service';
import { EfetivoService } from './efetivo.service';
import { MilitarConsolidatorService } from './militar-consolidator.service';
import { QdiDadosImportService } from './qdi-dados-import.service';
import { QdiDadosService } from './qdi-dados.service';
import { QdiImportService } from './qdi-import.service';
import { QdiService } from './qdi.service';

@Module({
  imports: [forwardRef(() => ChefesOperacoesModule)],
  controllers: [EfetivoController],
  providers: [
    EfetivoService,
    QdiService,
    QdiDadosService,
    // S2.10.8d — Consolidador 3-way + 3 ImportServices (SyncSource).
    MilitarConsolidatorService,
    EfetivoImportService,
    QdiImportService,
    QdiDadosImportService,
  ],
  exports: [
    EfetivoService,
    QdiService,
    QdiDadosService,
    MilitarConsolidatorService,
    EfetivoImportService,
    QdiImportService,
    QdiDadosImportService,
  ],
})
export class EfetivoModule {}

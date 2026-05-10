import { Module } from '@nestjs/common';
import { ChefesOperacoesModule } from '../chefes-operacoes/chefes-operacoes.module';
import { EfetivoModule } from '../efetivo/efetivo.module';
import { EscalasModule } from '../escalas/escalas.module';
import { EscalasEspeciaisModule } from '../escalas-especiais/escalas-especiais.module';
import { FiscaisModule } from '../fiscais/fiscais.module';
import { IdeoModule } from '../ideo/ideo.module';
import { MapaForcaModule } from '../mapa-forca/mapa-forca.module';
import { ViaturasModule } from '../viaturas/viaturas.module';
import { AjustesPreviaService } from './ajustes-previa.service';
import { PreviaController } from './previa.controller';
import { PreviaService } from './previa.service';

@Module({
  imports: [
    ChefesOperacoesModule,
    EfetivoModule,
    EscalasModule,
    EscalasEspeciaisModule,
    FiscaisModule,
    IdeoModule,
    MapaForcaModule,
    ViaturasModule,
  ],
  controllers: [PreviaController],
  providers: [PreviaService, AjustesPreviaService],
  exports: [PreviaService, AjustesPreviaService],
})
export class PreviaModule {}

import { Module } from '@nestjs/common';
import { EfetivoModule } from '../efetivo/efetivo.module';
import { EscalasModule } from '../escalas/escalas.module';
import { FiscaisModule } from '../fiscais/fiscais.module';
import { IdeoModule } from '../ideo/ideo.module';
import { ViaturasModule } from '../viaturas/viaturas.module';
import { PreviaController } from './previa.controller';
import { PreviaService } from './previa.service';

@Module({
  imports: [EfetivoModule, EscalasModule, FiscaisModule, IdeoModule, ViaturasModule],
  controllers: [PreviaController],
  providers: [PreviaService],
  exports: [PreviaService],
})
export class PreviaModule {}

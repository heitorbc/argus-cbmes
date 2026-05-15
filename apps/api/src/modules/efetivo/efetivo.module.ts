import { forwardRef, Module } from '@nestjs/common';
import { ChefesOperacoesModule } from '../chefes-operacoes/chefes-operacoes.module';
import { EfetivoController } from './efetivo.controller';
import { EfetivoService } from './efetivo.service';
import { QdiDadosService } from './qdi-dados.service';
import { QdiService } from './qdi.service';

@Module({
  imports: [forwardRef(() => ChefesOperacoesModule)],
  controllers: [EfetivoController],
  providers: [EfetivoService, QdiService, QdiDadosService],
  exports: [EfetivoService, QdiService, QdiDadosService],
})
export class EfetivoModule {}

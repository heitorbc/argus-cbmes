import { Module } from '@nestjs/common';
import { ChefesOperacoesModule } from '../chefes-operacoes/chefes-operacoes.module';
import { DispensasModule } from '../dispensas/dispensas.module';
import { TrocasAutorizadasModule } from '../trocas-autorizadas/trocas-autorizadas.module';
import { ViaturasModule } from '../viaturas/viaturas.module';
import { IntegracoesController } from './integracoes.controller';
import { IntegracoesService } from './integracoes.service';

@Module({
  imports: [ChefesOperacoesModule, DispensasModule, TrocasAutorizadasModule, ViaturasModule],
  controllers: [IntegracoesController],
  providers: [IntegracoesService],
  exports: [IntegracoesService],
})
export class IntegracoesModule {}

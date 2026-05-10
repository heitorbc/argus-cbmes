import { Module } from '@nestjs/common';
import { ChefesOperacoesService } from './chefes-operacoes.service';

@Module({
  providers: [ChefesOperacoesService],
  exports: [ChefesOperacoesService],
})
export class ChefesOperacoesModule {}

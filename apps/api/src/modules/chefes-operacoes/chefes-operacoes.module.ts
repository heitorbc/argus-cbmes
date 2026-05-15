import { forwardRef, Module } from '@nestjs/common';
import { EfetivoModule } from '../efetivo/efetivo.module';
import { ChefesOperacoesController } from './chefes-operacoes.controller';
import { ChefesOperacoesService } from './chefes-operacoes.service';

@Module({
  imports: [forwardRef(() => EfetivoModule)],
  controllers: [ChefesOperacoesController],
  providers: [ChefesOperacoesService],
  exports: [ChefesOperacoesService],
})
export class ChefesOperacoesModule {}

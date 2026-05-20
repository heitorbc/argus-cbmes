import { forwardRef, Module } from '@nestjs/common';
import { EfetivoModule } from '../efetivo/efetivo.module';
import { ChefesOperacoesController } from './chefes-operacoes.controller';
import { ChefesOperacoesImportService } from './chefes-operacoes-import.service';
import { ChefesOperacoesService } from './chefes-operacoes.service';

@Module({
  imports: [forwardRef(() => EfetivoModule)],
  controllers: [ChefesOperacoesController],
  providers: [ChefesOperacoesService, ChefesOperacoesImportService],
  exports: [ChefesOperacoesService, ChefesOperacoesImportService],
})
export class ChefesOperacoesModule {}

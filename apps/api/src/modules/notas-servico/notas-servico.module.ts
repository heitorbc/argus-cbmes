import { forwardRef, Module } from '@nestjs/common';
import { NotasServicoController } from './notas-servico.controller';
import { NotasServicoService } from './notas-servico.service';
import { SheetsDbModule } from '../sheets-db/sheets-db.module';
import { ServicoModule } from '../servico/servico.module';

@Module({
  imports: [SheetsDbModule, forwardRef(() => ServicoModule)],
  controllers: [NotasServicoController],
  providers: [NotasServicoService],
  exports: [NotasServicoService],
})
export class NotasServicoModule {}

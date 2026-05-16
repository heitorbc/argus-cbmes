import { Module } from '@nestjs/common';
import { NotasServicoController } from './notas-servico.controller';
import { NotasServicoService } from './notas-servico.service';
import { SheetsDbModule } from '../sheets-db/sheets-db.module';

@Module({
  imports: [SheetsDbModule],
  controllers: [NotasServicoController],
  providers: [NotasServicoService],
  exports: [NotasServicoService],
})
export class NotasServicoModule {}

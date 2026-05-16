import { Module } from '@nestjs/common';
import { EscalasEspeciaisController } from './escalas-especiais.controller';
import { EscalasEspeciaisService } from './escalas-especiais.service';
import { SheetsDbModule } from '../sheets-db/sheets-db.module';

@Module({
  imports: [SheetsDbModule],
  controllers: [EscalasEspeciaisController],
  providers: [EscalasEspeciaisService],
  exports: [EscalasEspeciaisService],
})
export class EscalasEspeciaisModule {}

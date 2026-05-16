import { Module } from '@nestjs/common';
import { EscalasController } from './escalas.controller';
import { EscalasService } from './escalas.service';
import { SheetsDbModule } from '../sheets-db/sheets-db.module';

@Module({
  imports: [SheetsDbModule],
  controllers: [EscalasController],
  providers: [EscalasService],
  exports: [EscalasService],
})
export class EscalasModule {}

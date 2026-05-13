import { Module } from '@nestjs/common';
import { EfetivoModule } from '../efetivo/efetivo.module';
import { DispensasController } from './dispensas.controller';
import { DispensasService } from './dispensas.service';
import { DispensasSheetService } from './dispensas-sheet.service';

@Module({
  imports: [EfetivoModule],
  controllers: [DispensasController],
  providers: [DispensasService, DispensasSheetService],
  exports: [DispensasService, DispensasSheetService],
})
export class DispensasModule {}

import { Module } from '@nestjs/common';
import { EfetivoModule } from '../efetivo/efetivo.module';
import { DispensasController } from './dispensas.controller';
import { DispensasImportService } from './dispensas-import.service';
import { DispensasService } from './dispensas.service';
import { DispensasSheetService } from './dispensas-sheet.service';

@Module({
  imports: [EfetivoModule],
  controllers: [DispensasController],
  providers: [DispensasService, DispensasSheetService, DispensasImportService],
  exports: [DispensasService, DispensasSheetService, DispensasImportService],
})
export class DispensasModule {}

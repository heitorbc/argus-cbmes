import { Module } from '@nestjs/common';
import { DispensasController } from './dispensas.controller';
import { DispensasService } from './dispensas.service';
import { DispensasSheetService } from './dispensas-sheet.service';

@Module({
  controllers: [DispensasController],
  providers: [DispensasService, DispensasSheetService],
  exports: [DispensasService, DispensasSheetService],
})
export class DispensasModule {}

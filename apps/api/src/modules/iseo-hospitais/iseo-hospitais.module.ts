import { Module } from '@nestjs/common';
import { IseoHospitaisService } from './iseo-hospitais.service';
import { IseoHospitaisImportService } from './iseo-hospitais-import.service';
import { IseoHospitaisController } from './iseo-hospitais.controller';

@Module({
  controllers: [IseoHospitaisController],
  providers: [IseoHospitaisService, IseoHospitaisImportService],
  exports: [IseoHospitaisService, IseoHospitaisImportService],
})
export class IseoHospitaisModule {}

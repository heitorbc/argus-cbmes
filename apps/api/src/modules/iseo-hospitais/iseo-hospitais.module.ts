import { Module } from '@nestjs/common';
import { IseoHospitaisService } from './iseo-hospitais.service';
import { IseoHospitaisController } from './iseo-hospitais.controller';

@Module({
  controllers: [IseoHospitaisController],
  providers: [IseoHospitaisService],
  exports: [IseoHospitaisService],
})
export class IseoHospitaisModule {}

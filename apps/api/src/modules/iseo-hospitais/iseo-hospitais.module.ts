import { Module } from '@nestjs/common';
import { IseoHospitaisService } from './iseo-hospitais.service';
import { IseoHospitaisController } from './iseo-hospitais.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [IseoHospitaisController],
  providers: [IseoHospitaisService],
  exports: [IseoHospitaisService],
})
export class IseoHospitaisModule {}

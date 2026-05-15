import { Module } from '@nestjs/common';
import { LocaisFaxinaController } from './locais-faxina.controller';
import { LocaisFaxinaService } from './locais-faxina.service';

@Module({
  controllers: [LocaisFaxinaController],
  providers: [LocaisFaxinaService],
  exports: [LocaisFaxinaService],
})
export class LocaisFaxinaModule {}

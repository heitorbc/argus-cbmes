import { Module } from '@nestjs/common';
import { PreviaModule } from '../previa/previa.module';
import { ParteDiariaController } from './parte-diaria.controller';
import { ParteDiariaService } from './parte-diaria.service';

@Module({
  imports: [PreviaModule],
  controllers: [ParteDiariaController],
  providers: [ParteDiariaService],
  exports: [ParteDiariaService],
})
export class ParteDiariaModule {}

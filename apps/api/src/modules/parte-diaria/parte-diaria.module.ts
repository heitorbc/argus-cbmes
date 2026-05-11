import { Module } from '@nestjs/common';
import { MateriaisModule } from '../materiais/materiais.module';
import { PreviaModule } from '../previa/previa.module';
import { ParteDiariaController } from './parte-diaria.controller';
import { ParteDiariaService } from './parte-diaria.service';

@Module({
  imports: [PreviaModule, MateriaisModule],
  controllers: [ParteDiariaController],
  providers: [ParteDiariaService],
  exports: [ParteDiariaService],
})
export class ParteDiariaModule {}

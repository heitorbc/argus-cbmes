import { Module } from '@nestjs/common';
import { MateriaisModule } from '../materiais/materiais.module';
import { MapaForcaModule } from '../mapa-forca/mapa-forca.module';
import { ParteDiariaController } from './parte-diaria.controller';
import { ParteDiariaService } from './parte-diaria.service';

@Module({
  imports: [MapaForcaModule, MateriaisModule],
  controllers: [ParteDiariaController],
  providers: [ParteDiariaService],
  exports: [ParteDiariaService],
})
export class ParteDiariaModule {}

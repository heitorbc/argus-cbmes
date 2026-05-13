import { Module } from '@nestjs/common';
import { MapaForcaModule } from '../mapa-forca/mapa-forca.module';
import { ViaturasController } from './viaturas.controller';
import { ViaturasService } from './viaturas.service';
import { ViaturasQdvService } from './viaturas-qdv.service';

@Module({
  imports: [MapaForcaModule],
  controllers: [ViaturasController],
  providers: [ViaturasService, ViaturasQdvService],
  exports: [ViaturasService, ViaturasQdvService],
})
export class ViaturasModule {}

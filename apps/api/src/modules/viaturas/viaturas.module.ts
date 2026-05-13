import { Module } from '@nestjs/common';
import { MapaForcaModule } from '../mapa-forca/mapa-forca.module';
import { ViaturasController } from './viaturas.controller';
import { ViaturasService } from './viaturas.service';
import { ViaturasQdvService } from './viaturas-qdv.service';
import { ViaturasQdvExtrasService } from './viaturas-qdv-extras.service';

@Module({
  imports: [MapaForcaModule],
  controllers: [ViaturasController],
  providers: [ViaturasService, ViaturasQdvService, ViaturasQdvExtrasService],
  exports: [ViaturasService, ViaturasQdvService, ViaturasQdvExtrasService],
})
export class ViaturasModule {}

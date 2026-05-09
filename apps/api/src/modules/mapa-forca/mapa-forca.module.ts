import { Module } from '@nestjs/common';
import { MapaForcaController } from './mapa-forca.controller';
import { MapaForcaService } from './mapa-forca.service';

@Module({
  controllers: [MapaForcaController],
  providers: [MapaForcaService],
  exports: [MapaForcaService],
})
export class MapaForcaModule {}

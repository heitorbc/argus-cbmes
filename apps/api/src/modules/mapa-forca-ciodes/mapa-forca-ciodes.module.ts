import { Module } from '@nestjs/common';
import { RecursosModule } from '../recursos/recursos.module';
import { MapaForcaCiodesController } from './mapa-forca-ciodes.controller';
import { MapaForcaCiodesService } from './mapa-forca-ciodes.service';

@Module({
  imports: [RecursosModule],
  controllers: [MapaForcaCiodesController],
  providers: [MapaForcaCiodesService],
  exports: [MapaForcaCiodesService],
})
export class MapaForcaCiodesModule {}

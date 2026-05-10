import { Module } from '@nestjs/common';
import { RecursosModule } from '../recursos/recursos.module';
import { MapaForcaController } from './mapa-forca.controller';
import { MapaForcaService } from './mapa-forca.service';

@Module({
  imports: [RecursosModule],
  controllers: [MapaForcaController],
  providers: [MapaForcaService],
  exports: [MapaForcaService],
})
export class MapaForcaModule {}

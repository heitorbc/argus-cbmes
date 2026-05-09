import { Module } from '@nestjs/common';
import { MapaForcaModule } from '../mapa-forca/mapa-forca.module';
import { ViaturasController } from './viaturas.controller';
import { ViaturasService } from './viaturas.service';

@Module({
  imports: [MapaForcaModule],
  controllers: [ViaturasController],
  providers: [ViaturasService],
  exports: [ViaturasService],
})
export class ViaturasModule {}

import { Module } from '@nestjs/common';
import { MapaForcaCiodesModule } from '../mapa-forca-ciodes/mapa-forca-ciodes.module';
import { ViaturasController } from './viaturas.controller';
import { ViaturasService } from './viaturas.service';
import { ViaturasQdvImportService } from './viaturas-qdv-import.service';
import { ViaturasQdvService } from './viaturas-qdv.service';
import { ViaturasQdvExtrasService } from './viaturas-qdv-extras.service';
import { ViaturasEnriquecidasService } from './viaturas-enriquecidas.service';

@Module({
  imports: [MapaForcaCiodesModule],
  controllers: [ViaturasController],
  providers: [
    ViaturasService,
    ViaturasQdvImportService,
    ViaturasQdvService,
    ViaturasQdvExtrasService,
    ViaturasEnriquecidasService,
  ],
  exports: [
    ViaturasService,
    ViaturasQdvImportService,
    ViaturasQdvService,
    ViaturasQdvExtrasService,
    ViaturasEnriquecidasService,
  ],
})
export class ViaturasModule {}

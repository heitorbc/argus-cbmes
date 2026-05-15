import { Module } from '@nestjs/common';
import { ConferenciaViaturaModule } from '../conferencia-viatura/conferencia-viatura.module';
import { LocaisFaxinaModule } from '../locais-faxina/locais-faxina.module';
import { MateriaisModule } from '../materiais/materiais.module';
import { MapaForcaModule } from '../mapa-forca/mapa-forca.module';
import { ViaturasModule } from '../viaturas/viaturas.module';
import { ParteDiariaController } from './parte-diaria.controller';
import { ParteDiariaService } from './parte-diaria.service';

@Module({
  imports: [
    MapaForcaModule,
    MateriaisModule,
    ConferenciaViaturaModule,
    ViaturasModule,
    LocaisFaxinaModule,
  ],
  controllers: [ParteDiariaController],
  providers: [ParteDiariaService],
  exports: [ParteDiariaService],
})
export class ParteDiariaModule {}

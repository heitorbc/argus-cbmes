import { forwardRef, Module } from '@nestjs/common';
import { ConferenciaEquipeModule } from '../conferencia-equipe/conferencia-equipe.module';
import { MapaForcaModule } from '../mapa-forca/mapa-forca.module';
import { ServicoModule } from '../servico/servico.module';
import { ViaturasModule } from '../viaturas/viaturas.module';
import { ConferenciaViaturaController } from './conferencia-viatura.controller';
import { ConferenciaViaturaService } from './conferencia-viatura.service';

@Module({
  imports: [
    ConferenciaEquipeModule,
    ServicoModule,
    ViaturasModule,
    forwardRef(() => MapaForcaModule),
  ],
  controllers: [ConferenciaViaturaController],
  providers: [ConferenciaViaturaService],
  exports: [ConferenciaViaturaService],
})
export class ConferenciaViaturaModule {}

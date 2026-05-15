import { forwardRef, Module } from '@nestjs/common';
import { MapaForcaModule } from '../mapa-forca/mapa-forca.module';
import { ServicoModule } from '../servico/servico.module';
import { ConferenciaEquipeController } from './conferencia-equipe.controller';
import { ConferenciaEquipeService } from './conferencia-equipe.service';

@Module({
  imports: [ServicoModule, forwardRef(() => MapaForcaModule)],
  controllers: [ConferenciaEquipeController],
  providers: [ConferenciaEquipeService],
  exports: [ConferenciaEquipeService],
})
export class ConferenciaEquipeModule {}

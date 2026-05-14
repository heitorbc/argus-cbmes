import { forwardRef, Module } from '@nestjs/common';
import { MapaForcaModule } from '../mapa-forca/mapa-forca.module';
import { ServicoController } from './servico.controller';
import { ServicoService } from './servico.service';

@Module({
  imports: [forwardRef(() => MapaForcaModule)],
  controllers: [ServicoController],
  providers: [ServicoService],
  exports: [ServicoService],
})
export class ServicoModule {}

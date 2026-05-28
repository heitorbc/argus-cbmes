import { forwardRef, Module } from '@nestjs/common';
import { EscalasController } from './escalas.controller';
import { EscalasService } from './escalas.service';
import { ServicoModule } from '../servico/servico.module';

@Module({
  // ServicoModule via forwardRef: ServicoModule → MapaForcaModule → EscalasModule
  // (ciclo de modules; NestJS resolve via forwardRef em ambos os lados quando
  //  necessário; aqui só o controller usa ServicoService então OK).
  imports: [forwardRef(() => ServicoModule)],
  controllers: [EscalasController],
  providers: [EscalasService],
  exports: [EscalasService],
})
export class EscalasModule {}

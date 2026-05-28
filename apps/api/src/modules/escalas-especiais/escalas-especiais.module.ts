import { forwardRef, Module } from '@nestjs/common';
import { EscalasEspeciaisController } from './escalas-especiais.controller';
import { EscalasEspeciaisService } from './escalas-especiais.service';
import { ServicoModule } from '../servico/servico.module';

@Module({
  imports: [forwardRef(() => ServicoModule)],
  controllers: [EscalasEspeciaisController],
  providers: [EscalasEspeciaisService],
  exports: [EscalasEspeciaisService],
})
export class EscalasEspeciaisModule {}

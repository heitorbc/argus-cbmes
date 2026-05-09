import { Module } from '@nestjs/common';
import { EscalasEspeciaisController } from './escalas-especiais.controller';
import { EscalasEspeciaisService } from './escalas-especiais.service';

@Module({
  controllers: [EscalasEspeciaisController],
  providers: [EscalasEspeciaisService],
  exports: [EscalasEspeciaisService],
})
export class EscalasEspeciaisModule {}

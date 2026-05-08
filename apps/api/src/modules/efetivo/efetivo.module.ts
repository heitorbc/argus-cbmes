import { Module } from '@nestjs/common';
import { EfetivoController } from './efetivo.controller';
import { EfetivoService } from './efetivo.service';

@Module({
  controllers: [EfetivoController],
  providers: [EfetivoService],
  exports: [EfetivoService],
})
export class EfetivoModule {}

import { Module } from '@nestjs/common';
import { EfetivoController } from './efetivo.controller';
import { EfetivoService } from './efetivo.service';
import { QdiService } from './qdi.service';

@Module({
  controllers: [EfetivoController],
  providers: [EfetivoService, QdiService],
  exports: [EfetivoService, QdiService],
})
export class EfetivoModule {}

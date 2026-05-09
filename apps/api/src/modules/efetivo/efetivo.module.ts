import { Module } from '@nestjs/common';
import { EfetivoController } from './efetivo.controller';
import { EfetivoService } from './efetivo.service';
import { QdiDadosService } from './qdi-dados.service';
import { QdiService } from './qdi.service';

@Module({
  controllers: [EfetivoController],
  providers: [EfetivoService, QdiService, QdiDadosService],
  exports: [EfetivoService, QdiService, QdiDadosService],
})
export class EfetivoModule {}

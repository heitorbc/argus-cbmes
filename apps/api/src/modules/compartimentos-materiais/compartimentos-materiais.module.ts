import { Module } from '@nestjs/common';
import {
  CompartimentosMateriaisController,
  ConferenciaMaterialV2Controller,
} from './compartimentos-materiais.controller';
import {
  CompartimentosMateriaisService,
  ConferenciaMaterialV2Service,
} from './compartimentos-materiais.service';

@Module({
  controllers: [CompartimentosMateriaisController, ConferenciaMaterialV2Controller],
  providers: [CompartimentosMateriaisService, ConferenciaMaterialV2Service],
  exports: [CompartimentosMateriaisService, ConferenciaMaterialV2Service],
})
export class CompartimentosMateriaisModule {}

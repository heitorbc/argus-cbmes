import { Module } from '@nestjs/common';
import { ViaturasController } from './viaturas.controller';
import { ViaturasService } from './viaturas.service';

@Module({
  controllers: [ViaturasController],
  providers: [ViaturasService],
  exports: [ViaturasService],
})
export class ViaturasModule {}

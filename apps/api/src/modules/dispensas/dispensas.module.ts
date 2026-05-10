import { Module } from '@nestjs/common';
import { DispensasController } from './dispensas.controller';
import { DispensasService } from './dispensas.service';

@Module({
  controllers: [DispensasController],
  providers: [DispensasService],
  exports: [DispensasService],
})
export class DispensasModule {}

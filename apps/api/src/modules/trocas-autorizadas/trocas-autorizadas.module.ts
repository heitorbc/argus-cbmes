import { Module } from '@nestjs/common';
import { TrocasAutorizadasController } from './trocas-autorizadas.controller';
import { TrocasAutorizadasService } from './trocas-autorizadas.service';

@Module({
  controllers: [TrocasAutorizadasController],
  providers: [TrocasAutorizadasService],
  exports: [TrocasAutorizadasService],
})
export class TrocasAutorizadasModule {}

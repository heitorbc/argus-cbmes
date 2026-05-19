import { Module } from '@nestjs/common';
import { EfetivoModule } from '../efetivo/efetivo.module';
import { TrocasAutorizadasController } from './trocas-autorizadas.controller';
import { TrocasAutorizadasImportService } from './trocas-autorizadas-import.service';
import { TrocasAutorizadasService } from './trocas-autorizadas.service';

@Module({
  imports: [EfetivoModule],
  controllers: [TrocasAutorizadasController],
  providers: [TrocasAutorizadasService, TrocasAutorizadasImportService],
  exports: [TrocasAutorizadasService, TrocasAutorizadasImportService],
})
export class TrocasAutorizadasModule {}

import { Module } from '@nestjs/common';
import { ServicoModule } from '../servico/servico.module';
import { ViaturasModule } from '../viaturas/viaturas.module';
import { ConferenciaViaturaController } from './conferencia-viatura.controller';
import { ConferenciaViaturaService } from './conferencia-viatura.service';

@Module({
  imports: [ServicoModule, ViaturasModule],
  controllers: [ConferenciaViaturaController],
  providers: [ConferenciaViaturaService],
  exports: [ConferenciaViaturaService],
})
export class ConferenciaViaturaModule {}

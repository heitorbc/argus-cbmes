import { Module } from '@nestjs/common';
import { ServicoModule } from '../servico/servico.module';
import { AtestadosController } from './atestados.controller';
import { AtestadosService } from './atestados.service';

@Module({
  imports: [ServicoModule],
  controllers: [AtestadosController],
  providers: [AtestadosService],
  exports: [AtestadosService],
})
export class AtestadosModule {}

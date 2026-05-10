import { Module } from '@nestjs/common';
import { ServicoModule } from '../servico/servico.module';
import { ConferenciaEquipeController } from './conferencia-equipe.controller';
import { ConferenciaEquipeService } from './conferencia-equipe.service';

@Module({
  imports: [ServicoModule],
  controllers: [ConferenciaEquipeController],
  providers: [ConferenciaEquipeService],
  exports: [ConferenciaEquipeService],
})
export class ConferenciaEquipeModule {}

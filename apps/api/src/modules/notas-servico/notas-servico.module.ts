import { Module } from '@nestjs/common';
import { NotasServicoController } from './notas-servico.controller';
import { NotasServicoService } from './notas-servico.service';

@Module({
  controllers: [NotasServicoController],
  providers: [NotasServicoService],
  exports: [NotasServicoService],
})
export class NotasServicoModule {}

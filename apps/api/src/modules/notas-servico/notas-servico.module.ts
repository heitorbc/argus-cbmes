import { forwardRef, Module } from '@nestjs/common';
import { NotasServicoController } from './notas-servico.controller';
import { NotasServicoService } from './notas-servico.service';
import { ServicoModule } from '../servico/servico.module';

@Module({
  imports: [forwardRef(() => ServicoModule)],
  controllers: [NotasServicoController],
  providers: [NotasServicoService],
  exports: [NotasServicoService],
})
export class NotasServicoModule {}

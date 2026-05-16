import { forwardRef, Module } from '@nestjs/common';
import { EscalasEspeciaisController } from './escalas-especiais.controller';
import { EscalasEspeciaisService } from './escalas-especiais.service';
import { SheetsDbModule } from '../sheets-db/sheets-db.module';
import { ServicoModule } from '../servico/servico.module';

@Module({
  imports: [SheetsDbModule, forwardRef(() => ServicoModule)],
  controllers: [EscalasEspeciaisController],
  providers: [EscalasEspeciaisService],
  exports: [EscalasEspeciaisService],
})
export class EscalasEspeciaisModule {}

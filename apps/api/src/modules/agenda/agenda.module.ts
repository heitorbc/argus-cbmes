import { Module } from '@nestjs/common';
import { AgendaService } from './agenda.service';
import { AgendaController } from './agenda.controller';
import { EscalasModule } from '../escalas/escalas.module';
import { EscalasEspeciaisModule } from '../escalas-especiais/escalas-especiais.module';
import { NotasServicoModule } from '../notas-servico/notas-servico.module';
import { ChefesOperacoesModule } from '../chefes-operacoes/chefes-operacoes.module';
import { IseoHospitaisModule } from '../iseo-hospitais/iseo-hospitais.module';

@Module({
  imports: [
    EscalasModule,
    EscalasEspeciaisModule,
    NotasServicoModule,
    ChefesOperacoesModule,
    IseoHospitaisModule,
  ],
  controllers: [AgendaController],
  providers: [AgendaService],
})
export class AgendaModule {}

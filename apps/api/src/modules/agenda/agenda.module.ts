import { Module } from '@nestjs/common';
import { AgendaService } from './agenda.service';
import { AgendaController } from './agenda.controller';
import { MapaForcaModule } from '../mapa-forca/mapa-forca.module';
import { EscalasEspeciaisModule } from '../escalas-especiais/escalas-especiais.module';
import { NotasServicoModule } from '../notas-servico/notas-servico.module';
import { ChefesOperacoesModule } from '../chefes-operacoes/chefes-operacoes.module';
import { IseoHospitaisModule } from '../iseo-hospitais/iseo-hospitais.module';
import { AtestadosModule } from '../atestados/atestados.module';
import { DispensasModule } from '../dispensas/dispensas.module';
import { FeriasModule } from '../ferias/ferias.module';
import { TrocasAutorizadasModule } from '../trocas-autorizadas/trocas-autorizadas.module';
import { EfetivoModule } from '../efetivo/efetivo.module';

@Module({
  imports: [
    MapaForcaModule,
    EscalasEspeciaisModule,
    NotasServicoModule,
    ChefesOperacoesModule,
    IseoHospitaisModule,
    AtestadosModule,
    DispensasModule,
    FeriasModule,
    TrocasAutorizadasModule,
    EfetivoModule,
  ],
  controllers: [AgendaController],
  providers: [AgendaService],
})
export class AgendaModule {}

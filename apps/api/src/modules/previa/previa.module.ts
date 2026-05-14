import { Module } from '@nestjs/common';
import { AtestadosModule } from '../atestados/atestados.module';
import { ChefesOperacoesModule } from '../chefes-operacoes/chefes-operacoes.module';
import { DispensasModule } from '../dispensas/dispensas.module';
import { EfetivoModule } from '../efetivo/efetivo.module';
import { EscalasModule } from '../escalas/escalas.module';
import { EscalasEspeciaisModule } from '../escalas-especiais/escalas-especiais.module';
import { FeriasModule } from '../ferias/ferias.module';
import { FiscaisModule } from '../fiscais/fiscais.module';
import { IdeoModule } from '../ideo/ideo.module';
import { MapaForcaModule } from '../mapa-forca/mapa-forca.module';
import { NotasServicoModule } from '../notas-servico/notas-servico.module';
import { ServicoModule } from '../servico/servico.module';
import { TrocasAutorizadasModule } from '../trocas-autorizadas/trocas-autorizadas.module';
import { ViaturasModule } from '../viaturas/viaturas.module';
import { AjustesPreviaService } from './ajustes-previa.service';
import { PreviaController } from './previa.controller';
import { PreviaService } from './previa.service';

// MapaForcaModule reincorporado para expor `composicaoAtualMf` no response —
// snapshot do turno corrente (col E-J), exibido lado-a-lado com a tripulação
// do próximo turno (XLSX). Militares da tripulação continuam vindo SÓ do XLSX.
@Module({
  imports: [
    AtestadosModule,
    ChefesOperacoesModule,
    DispensasModule,
    EfetivoModule,
    EscalasModule,
    EscalasEspeciaisModule,
    FeriasModule,
    FiscaisModule,
    IdeoModule,
    MapaForcaModule,
    NotasServicoModule,
    ServicoModule,
    TrocasAutorizadasModule,
    ViaturasModule,
  ],
  controllers: [PreviaController],
  providers: [PreviaService, AjustesPreviaService],
  exports: [PreviaService, AjustesPreviaService],
})
export class PreviaModule {}

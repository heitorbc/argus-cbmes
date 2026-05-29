import { forwardRef, Module } from '@nestjs/common';
import { AtestadosModule } from '../atestados/atestados.module';
import { ChefesOperacoesModule } from '../chefes-operacoes/chefes-operacoes.module';
import { DispensasModule } from '../dispensas/dispensas.module';
import { EfetivoModule } from '../efetivo/efetivo.module';
import { EscalasModule } from '../escalas/escalas.module';
import { EscalasEspeciaisModule } from '../escalas-especiais/escalas-especiais.module';
import { FeriasModule } from '../ferias/ferias.module';
import { FiscaisModule } from '../fiscais/fiscais.module';
import { IdeoModule } from '../ideo/ideo.module';
import { MapaForcaCiodesModule } from '../mapa-forca-ciodes/mapa-forca-ciodes.module';
import { NotasServicoModule } from '../notas-servico/notas-servico.module';
import { RecursosModule } from '../recursos/recursos.module';
import { ServicoModule } from '../servico/servico.module';
import { TrocasAutorizadasModule } from '../trocas-autorizadas/trocas-autorizadas.module';
import { ViaturasModule } from '../viaturas/viaturas.module';
import { AjustesPreviaService } from './ajustes-previa.service';
import { MapaForcaController } from './mapa-forca.controller';
import { MapaForcaService } from './mapa-forca.service';

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
    MapaForcaCiodesModule,
    NotasServicoModule,
    // S2.13e — RecursosModule passa a alimentar `recursos[]` do MF (substitui CIODES).
    RecursosModule,
    forwardRef(() => ServicoModule),
    TrocasAutorizadasModule,
    ViaturasModule,
  ],
  controllers: [MapaForcaController],
  providers: [MapaForcaService, AjustesPreviaService],
  exports: [MapaForcaService, AjustesPreviaService],
})
export class MapaForcaModule {}

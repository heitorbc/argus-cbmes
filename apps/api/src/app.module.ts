import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './modules/auth/auth.module';
import { ChefesOperacoesModule } from './modules/chefes-operacoes/chefes-operacoes.module';
import { ConferenciaEquipeModule } from './modules/conferencia-equipe/conferencia-equipe.module';
import { AtestadosModule } from './modules/atestados/atestados.module';
import { ConferenciaViaturaModule } from './modules/conferencia-viatura/conferencia-viatura.module';
import { DispensasModule } from './modules/dispensas/dispensas.module';
import { EfetivoModule } from './modules/efetivo/efetivo.module';
import { EscalasModule } from './modules/escalas/escalas.module';
import { EscalasEspeciaisModule } from './modules/escalas-especiais/escalas-especiais.module';
import { FeriasModule } from './modules/ferias/ferias.module';
import { FiscaisModule } from './modules/fiscais/fiscais.module';
import { HealthModule } from './modules/health/health.module';
import { IdeoModule } from './modules/ideo/ideo.module';
import { IntegracoesModule } from './modules/integracoes/integracoes.module';
import { MapaForcaModule } from './modules/mapa-forca/mapa-forca.module';
import { MapaForcaCiodesModule } from './modules/mapa-forca-ciodes/mapa-forca-ciodes.module';
import { MateriaisModule } from './modules/materiais/materiais.module';
import { NotasServicoModule } from './modules/notas-servico/notas-servico.module';
import { ParteDiariaModule } from './modules/parte-diaria/parte-diaria.module';
import { RecursosModule } from './modules/recursos/recursos.module';
import { ServicoModule } from './modules/servico/servico.module';
import { TrocasAutorizadasModule } from './modules/trocas-autorizadas/trocas-autorizadas.module';
import { UnidadesModule } from './modules/unidades/unidades.module';
import { ViaturasModule } from './modules/viaturas/viaturas.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    AtestadosModule,
    AuthModule,
    ChefesOperacoesModule,
    ConferenciaEquipeModule,
    ConferenciaViaturaModule,
    DispensasModule,
    EfetivoModule,
    EscalasModule,
    EscalasEspeciaisModule,
    FeriasModule,
    FiscaisModule,
    HealthModule,
    IdeoModule,
    IntegracoesModule,
    MapaForcaModule,
    MapaForcaCiodesModule,
    MateriaisModule,
    NotasServicoModule,
    ParteDiariaModule,
    RecursosModule,
    ServicoModule,
    TrocasAutorizadasModule,
    UnidadesModule,
    ViaturasModule,
  ],
})
export class AppModule {}

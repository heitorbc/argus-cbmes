import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './modules/auth/auth.module';
import { ChefesOperacoesModule } from './modules/chefes-operacoes/chefes-operacoes.module';
import { ConferenciaEquipeModule } from './modules/conferencia-equipe/conferencia-equipe.module';
import { ConferenciaViaturaModule } from './modules/conferencia-viatura/conferencia-viatura.module';
import { EfetivoModule } from './modules/efetivo/efetivo.module';
import { EscalasModule } from './modules/escalas/escalas.module';
import { EscalasEspeciaisModule } from './modules/escalas-especiais/escalas-especiais.module';
import { FiscaisModule } from './modules/fiscais/fiscais.module';
import { HealthModule } from './modules/health/health.module';
import { IdeoModule } from './modules/ideo/ideo.module';
import { MapaForcaModule } from './modules/mapa-forca/mapa-forca.module';
import { PreviaModule } from './modules/previa/previa.module';
import { RecursosModule } from './modules/recursos/recursos.module';
import { ServicoModule } from './modules/servico/servico.module';
import { UnidadesModule } from './modules/unidades/unidades.module';
import { ViaturasModule } from './modules/viaturas/viaturas.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    AuthModule,
    ChefesOperacoesModule,
    ConferenciaEquipeModule,
    ConferenciaViaturaModule,
    EfetivoModule,
    EscalasModule,
    EscalasEspeciaisModule,
    FiscaisModule,
    HealthModule,
    IdeoModule,
    MapaForcaModule,
    PreviaModule,
    RecursosModule,
    ServicoModule,
    UnidadesModule,
    ViaturasModule,
  ],
})
export class AppModule {}

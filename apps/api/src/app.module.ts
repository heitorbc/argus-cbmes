import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './common/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { AgendaModule } from './modules/agenda/agenda.module';
import { ChefesOperacoesModule } from './modules/chefes-operacoes/chefes-operacoes.module';
import { CompartimentosMateriaisModule } from './modules/compartimentos-materiais/compartimentos-materiais.module';
import { ConferenciaCovModule } from './modules/conferencia-cov/conferencia-cov.module';
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
import { IncidentesBaonModule } from './modules/incidentes-baon/incidentes-baon.module';
import { IntegracoesModule } from './modules/integracoes/integracoes.module';
import { IseoHospitaisModule } from './modules/iseo-hospitais/iseo-hospitais.module';
import { LocaisFaxinaModule } from './modules/locais-faxina/locais-faxina.module';
import { MapaForcaModule } from './modules/mapa-forca/mapa-forca.module';
import { MapaForcaCiodesModule } from './modules/mapa-forca-ciodes/mapa-forca-ciodes.module';
import { MateriaisModule } from './modules/materiais/materiais.module';
import { NotasServicoModule } from './modules/notas-servico/notas-servico.module';
import { ParteDiariaModule } from './modules/parte-diaria/parte-diaria.module';
import { RecursosModule } from './modules/recursos/recursos.module';
import { ServicoModule } from './modules/servico/servico.module';
import { SheetsDbModule } from './modules/sheets-db/sheets-db.module';
import { SyncOrchestratorModule } from './modules/sync-orchestrator/sync-orchestrator.module';
import { TrocasAutorizadasModule } from './modules/trocas-autorizadas/trocas-autorizadas.module';
import { UnidadesModule } from './modules/unidades/unidades.module';
import { ViaturasModule } from './modules/viaturas/viaturas.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Lê env vars em ordem de prioridade (primeiro encontrado vence). Em
      // dev, `nest start --watch` roda com cwd em `apps/api/`, então usamos
      // caminhos relativos. `.env.local` na raiz é o padrão para overrides
      // pessoais (ex.: credenciais SA do Sheets-DB) — fica fora do git.
      // Em produção (Render), as vars vêm do painel; estes paths simplesmente
      // não existem e o ConfigModule cai no `process.env`.
      envFilePath: ['.env.local', '../../.env.local', '.env', '../../.env'],
    }),
    // S2.10.8a — Scheduler global para o SyncOrchestratorService (cron 00/06/12/18h).
    ScheduleModule.forRoot(),
    PrismaModule,
    AtestadosModule,
    AuthModule,
    AgendaModule,
    ChefesOperacoesModule,
    CompartimentosMateriaisModule,
    ConferenciaCovModule,
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
    IncidentesBaonModule,
    IntegracoesModule,
    IseoHospitaisModule,
    LocaisFaxinaModule,
    MapaForcaModule,
    MapaForcaCiodesModule,
    MateriaisModule,
    NotasServicoModule,
    ParteDiariaModule,
    RecursosModule,
    ServicoModule,
    SheetsDbModule,
    SyncOrchestratorModule,
    TrocasAutorizadasModule,
    UnidadesModule,
    ViaturasModule,
  ],
})
export class AppModule {}

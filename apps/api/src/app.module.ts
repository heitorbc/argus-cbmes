import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './modules/auth/auth.module';
import { EfetivoModule } from './modules/efetivo/efetivo.module';
import { EscalasModule } from './modules/escalas/escalas.module';
import { FiscaisModule } from './modules/fiscais/fiscais.module';
import { HealthModule } from './modules/health/health.module';
import { IdeoModule } from './modules/ideo/ideo.module';
import { PreviaModule } from './modules/previa/previa.module';
import { ViaturasModule } from './modules/viaturas/viaturas.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    AuthModule,
    EfetivoModule,
    EscalasModule,
    FiscaisModule,
    HealthModule,
    IdeoModule,
    PreviaModule,
    ViaturasModule,
  ],
})
export class AppModule {}

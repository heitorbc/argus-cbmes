import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './modules/auth/auth.module';
import { EfetivoModule } from './modules/efetivo/efetivo.module';
import { FiscaisModule } from './modules/fiscais/fiscais.module';
import { HealthModule } from './modules/health/health.module';
import { IdeoModule } from './modules/ideo/ideo.module';
import { ViaturasModule } from './modules/viaturas/viaturas.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    AuthModule,
    EfetivoModule,
    FiscaisModule,
    HealthModule,
    IdeoModule,
    ViaturasModule,
  ],
})
export class AppModule {}

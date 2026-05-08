import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './modules/auth/auth.module';
import { EfetivoModule } from './modules/efetivo/efetivo.module';
import { HealthModule } from './modules/health/health.module';
import { ViaturasModule } from './modules/viaturas/viaturas.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    AuthModule,
    EfetivoModule,
    HealthModule,
    ViaturasModule,
  ],
})
export class AppModule {}

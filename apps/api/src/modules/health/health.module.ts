import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { MapaForcaCiodesModule } from '../mapa-forca-ciodes/mapa-forca-ciodes.module';

@Module({
  // S2.6 / S2.10.13a — depende apenas de Mapa Força CIODES para o
  // endpoint `/health/status`. Supabase entra via PrismaModule (@Global).
  // SheetsDb foi removido (dual-write encerrado em S2.10.9d).
  imports: [MapaForcaCiodesModule],
  controllers: [HealthController],
})
export class HealthModule {}

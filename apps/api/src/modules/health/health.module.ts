import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { MapaForcaCiodesModule } from '../mapa-forca-ciodes/mapa-forca-ciodes.module';

@Module({
  // Depende apenas de Mapa Força CIODES para o endpoint `/health/status`.
  // Supabase entra via PrismaModule (@Global). Sheets-DB foi totalmente
  // removido em S2.10.14 (dual-write encerrou em S2.10.9d).
  imports: [MapaForcaCiodesModule],
  controllers: [HealthController],
})
export class HealthModule {}

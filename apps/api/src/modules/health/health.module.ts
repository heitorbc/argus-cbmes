import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { SheetsDbModule } from '../sheets-db/sheets-db.module';
import { MapaForcaCiodesModule } from '../mapa-forca-ciodes/mapa-forca-ciodes.module';

@Module({
  // S2.6 — depende de Sheets-DB e Mapa Força CIODES para o endpoint
  // `/health/status`. Ambos têm services injetados como `@Optional()`
  // para preservar testes que instanciam o controller direto.
  imports: [SheetsDbModule, MapaForcaCiodesModule],
  controllers: [HealthController],
})
export class HealthModule {}

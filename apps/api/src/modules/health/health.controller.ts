import { Controller, Get, Optional } from '@nestjs/common';
import type { HealthEstado, HealthServico, HealthStatus } from '@argus/shared-types';
import { Public } from '../auth/decorators/public.decorator';
import { SheetsDbService } from '../sheets-db/sheets-db.service';
import { MapaForcaCiodesService } from '../mapa-forca-ciodes/mapa-forca-ciodes.service';

@Controller('health')
export class HealthController {
  constructor(
    @Optional() private readonly sheetsDb?: SheetsDbService,
    @Optional() private readonly mapaForcaCiodes?: MapaForcaCiodesService,
  ) {}

  @Public()
  @Get()
  check() {
    return {
      status: 'ok',
      service: 'argus-cbmes-api',
      ts: new Date().toISOString(),
    };
  }

  /**
   * S2.6 — Status agregado dos serviços externos. Lido pelo `StatusBar`
   * no frontend para mostrar 🟢🟡🔴 sob o cabeçalho da home. Endpoint
   * `@Public` (não exige auth) para que o status apareça mesmo na tela
   * de login durante o cold start.
   */
  @Public()
  @Get('status')
  async status(): Promise<HealthStatus> {
    const [api, sheetsDb, mapaForcaCiodes] = await Promise.all([
      this.checkApi(),
      this.checkSheetsDb(),
      this.checkMapaForcaCiodes(),
    ]);
    return {
      api,
      sheetsDb,
      mapaForcaCiodes,
      // S2.9 substituirá por check real do Postgres.
      supabase: { estado: 'pending', detalhe: 'Migração planejada para S2.9' },
      geradoEm: new Date().toISOString(),
    };
  }

  private checkApi(): HealthServico {
    const uptimeSec = Math.floor(process.uptime());
    return {
      estado: 'ok',
      detalhe: `uptime ${formatUptime(uptimeSec)}`,
    };
  }

  private checkSheetsDb(): HealthServico {
    if (!this.sheetsDb) {
      return { estado: 'pending', detalhe: 'Service não disponível' };
    }
    const s = this.sheetsDb.getStatus();
    if (!s.enabled) {
      return {
        estado: 'pending',
        detalhe: s.ultimoErro ?? 'Sheets-DB desabilitado (sem GOOGLE_SHEETS_SA_KEY_BASE64)',
      };
    }
    const todasExistem = s.abas.every((a) => a.existe);
    const estado: HealthEstado = todasExistem ? 'ok' : 'degraded';
    return {
      estado,
      ultimaSyncEm: s.bootstrappedAt,
      detalhe: todasExistem
        ? `${s.abas.length} abas OK`
        : `${s.abas.filter((a) => !a.existe).length} aba(s) ausente(s)`,
    };
  }

  private async checkMapaForcaCiodes(): Promise<HealthServico> {
    if (!this.mapaForcaCiodes) {
      return { estado: 'pending', detalhe: 'Service não disponível' };
    }
    try {
      const snap = await this.mapaForcaCiodes.getSnapshot();
      return {
        estado: snap.stale ? 'degraded' : 'ok',
        ultimaSyncEm: snap.syncedAt,
        detalhe: snap.stale
          ? 'Snapshot stale (última sync com erro; servindo cache antigo)'
          : `${snap.recursos.length} recursos sincronizados`,
      };
    } catch (err) {
      return {
        estado: 'down',
        detalhe: (err as Error).message.slice(0, 200),
      };
    }
  }
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const min = Math.floor(seconds / 60);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  return `${h}h${min % 60}m`;
}

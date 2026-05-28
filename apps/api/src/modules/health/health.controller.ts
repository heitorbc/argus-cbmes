import { Controller, Get, Optional } from '@nestjs/common';
import type { HealthEstado, HealthServico, HealthStatus } from '@argus/shared-types';
import { Public } from '../auth/decorators/public.decorator';
import { MapaForcaCiodesService } from '../mapa-forca-ciodes/mapa-forca-ciodes.service';
import { PrismaService } from '../../common/prisma/prisma.service';

const SUPABASE_TIMEOUT_MS = 2000;
const SUPABASE_DEGRADED_THRESHOLD_MS = 1000;

@Controller('health')
export class HealthController {
  constructor(
    @Optional() private readonly mapaForcaCiodes?: MapaForcaCiodesService,
    @Optional() private readonly prisma?: PrismaService,
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
   * S2.6 / S2.10.13a — Status agregado dos 3 serviços críticos. Lido pelo
   * `StatusBar` na home e no `Footer` do app. Endpoint `@Public` (não
   * exige auth) para aparecer mesmo na tela de login durante cold start.
   *
   * S2.10.13a removeu `sheetsDb` (Sheets-DB encerrado em S2.10.9d) e
   * implementou check real do Supabase via `prisma.$queryRaw\`SELECT 1\``
   * com timeout 2s + threshold 1s para 'degraded'.
   */
  @Public()
  @Get('status')
  async status(): Promise<HealthStatus> {
    const [api, mapaForcaCiodes, supabase] = await Promise.all([
      this.checkApi(),
      this.checkMapaForcaCiodes(),
      this.checkSupabase(),
    ]);
    return {
      api,
      mapaForcaCiodes,
      supabase,
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

  /**
   * S2.10.13a — Check real do Postgres via `SELECT 1`. Timeout explícito
   * para não travar o `/health/status` em cold start do pool.
   */
  private async checkSupabase(): Promise<HealthServico> {
    if (!this.prisma) {
      return { estado: 'pending', detalhe: 'PrismaService não injetado' };
    }
    const start = Date.now();
    try {
      const query = this.prisma.$queryRaw`SELECT 1 AS ok`;
      await Promise.race([
        query,
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error(`Supabase timeout >${SUPABASE_TIMEOUT_MS}ms`)),
            SUPABASE_TIMEOUT_MS,
          ),
        ),
      ]);
      const elapsed = Date.now() - start;
      const estado: HealthEstado = elapsed > SUPABASE_DEGRADED_THRESHOLD_MS ? 'degraded' : 'ok';
      return {
        estado,
        ultimaSyncEm: new Date().toISOString(),
        detalhe:
          estado === 'degraded'
            ? `latência ${elapsed}ms (>${SUPABASE_DEGRADED_THRESHOLD_MS}ms)`
            : `latência ${elapsed}ms`,
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

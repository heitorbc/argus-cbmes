import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { ConsolidationResult } from './militar-consolidator.service';
import { MilitarConsolidatorService } from './militar-consolidator.service';
import { QdiDadosService } from './qdi-dados.service';

const CACHE_TTL_MS = 5 * 60 * 1000;

interface SyncResult extends ConsolidationResult {
  syncedAt: string;
}

/**
 * S2.10.8d — Wrapper SyncSource para a aba QDI/DADOS (fonte primária do
 * consolidador, conforme ADR-008).
 *
 * `forceSync()` invalida o cache do `QdiDadosService` e chama o
 * `MilitarConsolidatorService.consolidateAndUpsert()` (compartilhado com as
 * outras 2 sources EFETIVO e QDI 1ª1º).
 *
 * Ver `MilitarConsolidatorService` para detalhes sobre o inflight lock e
 * counts compartilhados.
 */
@Injectable()
export class QdiDadosImportService {
  readonly id = 'qdi-dados-import';
  readonly nome = 'QDI/DADOS → Postgres (upsert consolidado)';

  private readonly logger = new Logger(QdiDadosImportService.name);
  private lastSync: SyncResult | null = null;
  private lastSyncAtMs: number | null = null;

  constructor(
    private readonly qdiDados: QdiDadosService,
    private readonly consolidator: MilitarConsolidatorService,
  ) {}

  getSyncStatus(): {
    syncedAt: string | null;
    counts: { created: number; updated: number; skipped: number } | null;
    stale: boolean;
  } {
    if (!this.lastSync || this.lastSyncAtMs === null) {
      return { syncedAt: null, counts: null, stale: false };
    }
    return {
      syncedAt: this.lastSync.syncedAt,
      counts: {
        created: this.lastSync.created,
        updated: this.lastSync.updated,
        skipped: this.lastSync.skipped,
      },
      stale: Date.now() - this.lastSyncAtMs >= CACHE_TTL_MS,
    };
  }

  async forceSync(): Promise<SyncResult> {
    try {
      this.qdiDados.invalidateCache();
      const result = await this.consolidator.consolidateAndUpsert();
      const out: SyncResult = { ...result, syncedAt: new Date().toISOString() };
      this.lastSync = out;
      this.lastSyncAtMs = Date.now();
      return out;
    } catch (err) {
      this.logger.error(`forceSync QDI/DADOS falhou: ${(err as Error).message}`);
      throw new ServiceUnavailableException('Não foi possível sincronizar com a aba QDI/DADOS.');
    }
  }
}

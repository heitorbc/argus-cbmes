import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { EfetivoService } from './efetivo.service';
import type { ConsolidationResult } from './militar-consolidator.service';
import { MilitarConsolidatorService } from './militar-consolidator.service';

const CACHE_TTL_MS = 5 * 60 * 1000;

interface SyncResult extends ConsolidationResult {
  syncedAt: string;
}

/**
 * S2.10.8d — Wrapper SyncSource para a planilha EFETIVO (Sargenteante).
 *
 * `forceSync()` invalida o cache do `EfetivoService` (força refresh do CSV
 * do EFETIVO) e chama o `MilitarConsolidatorService.consolidateAndUpsert()`,
 * que persiste a consolidação 3-way em `prisma.militar`.
 *
 * Como o consolidador é compartilhado pelas 3 sources via inflight lock,
 * chamar `forceSync()` aqui tem efeito colateral de re-consolidar TODA a
 * tabela `Militar` — não só a fonte EFETIVO. Isto é intencional: cada
 * mudança numa das 3 planilhas requer re-merge total para manter coerência.
 */
@Injectable()
export class EfetivoImportService {
  readonly id = 'efetivo-import';
  readonly nome = 'EFETIVO (Sargenteante) → Postgres (upsert consolidado)';

  private readonly logger = new Logger(EfetivoImportService.name);
  private lastSync: SyncResult | null = null;
  private lastSyncAtMs: number | null = null;

  constructor(
    private readonly efetivo: EfetivoService,
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
      this.efetivo.invalidateRawCache();
      const result = await this.consolidator.consolidateAndUpsert();
      const out: SyncResult = { ...result, syncedAt: new Date().toISOString() };
      this.lastSync = out;
      this.lastSyncAtMs = Date.now();
      return out;
    } catch (err) {
      this.logger.error(`forceSync EFETIVO falhou: ${(err as Error).message}`);
      throw new ServiceUnavailableException(
        'Não foi possível sincronizar com a planilha EFETIVO (Sargenteante).',
      );
    }
  }
}

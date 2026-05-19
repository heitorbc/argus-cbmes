import { Inject, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { SyncLog } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * S2.10.8a — Resultado padrão de `forceSync()` de uma SyncSource.
 *
 * Esta forma é compatível com `DispensasImportService.SyncResult` (sem o
 * `syncedAt` que é gravado por aqui no `SyncLog`).
 */
export interface SyncSourceResult {
  created: number;
  updated: number;
  skipped: number;
  inconsistencias: string[];
}

/**
 * S2.10.8a — Status atual em memória, exibido em `/configuracoes/integracoes`.
 * `counts` opcional ou null — varia conforme service.
 */
export interface SyncSourceStatus {
  syncedAt: string | null;
  counts?: { created: number; updated: number; skipped: number } | null;
  stale: boolean;
}

/**
 * S2.10.8a — Interface implementada pelos services que persistem planilhas
 * externas em Postgres via upsert. Registrados em `SYNC_SOURCES` (token de
 * injeção) e iterados pelo `SyncOrchestratorService` no startup, cron e
 * triggers manuais.
 *
 * Já compatível com `DispensasImportService` (S2.10.7d/e); novos services em
 * S2.10.8b/c/d implementarão a mesma interface.
 */
export interface SyncSource {
  /** ID estável (kebab-case). Usado como `SyncLog.fonte` e em URLs do dashboard. */
  readonly id: string;
  /** Nome amigável para UI. */
  readonly nome: string;
  /** Executa o sync e devolve counts. Não deve lançar — exceções viram `failed` no log. */
  forceSync(): Promise<SyncSourceResult>;
  /** Status atual em memória (pode ser null se nunca rodou). */
  getSyncStatus(): SyncSourceStatus;
}

/** Token DI para o array de `SyncSource[]` provido pelo SyncOrchestratorModule. */
export const SYNC_SOURCES = Symbol('SYNC_SOURCES');

/**
 * S2.10.8a — Orquestrador central de sincronizações com planilhas externas.
 *
 * - **Startup (onModuleInit)**: dispara `syncAll('startup')` em background
 *   (fire-and-forget). Não bloqueia o boot do servidor.
 * - **Cron** (`0 0,6,12,18 * * *`): a cada 6h fixas (00, 06, 12, 18 UTC).
 * - **Manual** (admin via `/configuracoes/integracoes`): `syncOne(id)` ou
 *   `syncAll('manual')` chamados pelo controller.
 *
 * Cada execução grava 1 `SyncLog` por source (status, counts, erros, duração,
 * trigger). Histórico visível no dashboard.
 *
 * Decisão D2 do plano: MAPA FORÇA CIODES NÃO é registrado aqui (real-time only
 * por opção do Tech Lead; alta frequência de atualização direta na planilha).
 */
@Injectable()
export class SyncOrchestratorService implements OnModuleInit {
  private readonly logger = new Logger(SyncOrchestratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SYNC_SOURCES) private readonly sources: readonly SyncSource[],
  ) {}

  /** Sync inicial fire-and-forget no startup. Não bloqueia boot. */
  async onModuleInit(): Promise<void> {
    if (this.sources.length === 0) {
      this.logger.warn('Nenhuma SyncSource registrada — sync orchestrator inativo.');
      return;
    }
    this.logger.log(
      `Startup sync (fire-and-forget): ${this.sources.length} source(s) registradas — ${this.sources.map((s) => s.id).join(', ')}`,
    );
    // Fire-and-forget: erros viram log na própria syncAll; não bloqueia boot.
    void this.syncAll('startup').catch((err) => {
      this.logger.error(`Startup sync inesperado: ${(err as Error).message}`);
    });
  }

  /** Cron 00h/06h/12h/18h (UTC). Padrão fixo acordado com Tech Lead. */
  @Cron('0 0 0,6,12,18 * * *')
  async syncCron(): Promise<void> {
    this.logger.log('Cron sync disparado (00/06/12/18h)');
    await this.syncAll('cron');
  }

  /**
   * Roda todas as sources em paralelo. Cada uma grava seu próprio SyncLog
   * (sucesso ou falha). Retorna array com os logs gravados.
   */
  async syncAll(trigger: string): Promise<SyncLog[]> {
    const results = await Promise.all(this.sources.map((s) => this.runOne(s, trigger)));
    return results;
  }

  /** Roda uma source específica por ID. Lança NotFoundException se ID desconhecido. */
  async syncOne(id: string, trigger = 'manual'): Promise<SyncLog> {
    const source = this.sources.find((s) => s.id === id);
    if (!source) {
      throw new NotFoundException(`SyncSource '${id}' não registrada no orquestrador.`);
    }
    return this.runOne(source, trigger);
  }

  /**
   * Histórico de syncs. Quando `fonte` é informado, filtra; senão retorna
   * últimos N logs de qualquer fonte (ordenados por finalizadoEm DESC).
   */
  async getHistory(fonte?: string, limit = 20): Promise<SyncLog[]> {
    return this.prisma.syncLog.findMany({
      where: fonte ? { fonte } : undefined,
      orderBy: { finalizadoEm: 'desc' },
      take: limit,
    });
  }

  /** Status agregado de todas as sources (para dashboard topo). */
  getAllStatuses(): Array<{ id: string; nome: string; status: SyncSourceStatus }> {
    return this.sources.map((s) => ({ id: s.id, nome: s.nome, status: s.getSyncStatus() }));
  }

  /** Executa 1 source, captura erros, grava SyncLog. Não lança. */
  private async runOne(source: SyncSource, trigger: string): Promise<SyncLog> {
    const iniciadoEm = new Date();
    const startMs = Date.now();
    try {
      const result = await source.forceSync();
      const duracaoMs = Date.now() - startMs;
      const status =
        result.inconsistencias.length > 0 && result.created + result.updated === 0
          ? 'failed'
          : result.inconsistencias.length > 0
            ? 'partial'
            : 'success';
      const log = await this.prisma.syncLog.create({
        data: {
          fonte: source.id,
          status,
          created: result.created,
          updated: result.updated,
          skipped: result.skipped,
          erros: result.inconsistencias,
          trigger,
          duracaoMs,
          iniciadoEm,
        },
      });
      this.logger.log(
        `Sync ${source.id} OK (trigger=${trigger}, created=${result.created}, updated=${result.updated}, skipped=${result.skipped}, ${duracaoMs}ms)`,
      );
      return log;
    } catch (err) {
      const duracaoMs = Date.now() - startMs;
      const msg = (err as Error).message ?? String(err);
      this.logger.error(`Sync ${source.id} FAILED (trigger=${trigger}): ${msg}`);
      return this.prisma.syncLog.create({
        data: {
          fonte: source.id,
          status: 'failed',
          erros: [msg],
          trigger,
          duracaoMs,
          iniciadoEm,
        },
      });
    }
  }
}

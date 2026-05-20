import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { parseChefesOperacoesCsv } from './chefes-operacoes-csv-parser';

const CACHE_TTL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 15_000;

export interface SyncResult {
  created: number;
  updated: number;
  skipped: number;
  inconsistencias: string[];
  syncedAt: string;
}

/**
 * S2.10.9a — Importa a planilha "Escala de Chefe de Operações" e persiste
 * em `prisma.chefeOperacoesEscala`. Replace-all strategy: a planilha mostra
 * apenas o mês corrente; cada sync apaga o estado antigo e insere o novo.
 *
 * Pattern espelha `DispensasImportService` (S2.10.8a) e
 * `TrocasAutorizadasImportService` (S2.10.8b).
 */
@Injectable()
export class ChefesOperacoesImportService {
  /** S2.10.9a — Identifier estável para o SyncOrchestrator. */
  readonly id = 'chefes-operacoes-import';
  /** Nome amigável exibido em /configuracoes/integracoes. */
  readonly nome = 'Chefes de Operações → Postgres (replace-all)';

  private readonly logger = new Logger(ChefesOperacoesImportService.name);
  private lastSync: SyncResult | null = null;
  private lastSyncAtMs: number | null = null;
  private inflight: Promise<SyncResult> | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  getSyncStatus(): {
    syncedAt: string | null;
    counts: Pick<SyncResult, 'created' | 'updated' | 'skipped'> | null;
    stale: boolean;
    inconsistencias: number;
  } {
    if (!this.lastSync || this.lastSyncAtMs === null) {
      return { syncedAt: null, counts: null, stale: false, inconsistencias: 0 };
    }
    return {
      syncedAt: this.lastSync.syncedAt,
      counts: {
        created: this.lastSync.created,
        updated: this.lastSync.updated,
        skipped: this.lastSync.skipped,
      },
      stale: Date.now() - this.lastSyncAtMs >= CACHE_TTL_MS,
      inconsistencias: this.lastSync.inconsistencias.length,
    };
  }

  async forceSync(): Promise<SyncResult> {
    try {
      return await this.syncToDatabase();
    } catch (err) {
      this.logger.error(`forceSync ChOp falhou: ${(err as Error).message}`);
      throw new ServiceUnavailableException(
        'Não foi possível sincronizar com a planilha de Chefes de Operações.',
      );
    }
  }

  async syncToDatabase(): Promise<SyncResult> {
    if (this.inflight) return this.inflight;
    this.inflight = this.executeSyncToDatabase().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async executeSyncToDatabase(): Promise<SyncResult> {
    const parsed = await this.fetchAndParse();
    this.logger.log(`ChOp: parser retornou ${parsed.length} militares`);

    const inconsistencias: string[] = [];

    // Replace-all: a planilha é o estado canônico do mês corrente.
    // O `deleteMany` + `createMany` precisa ser atômico para não deixar
    // estado intermediário visível para outros requests.
    let created = 0;
    let updated = 0;
    let skipped = 0;

    const rows: Array<{
      nf: string;
      dia: number;
      marcador: string;
      posto: string;
      nomeGuerra: string;
      telefone: string | null;
    }> = [];
    for (const c of parsed) {
      try {
        for (const [dia, marcador] of c.porDia) {
          rows.push({
            nf: c.nf,
            dia,
            marcador,
            posto: c.posto,
            nomeGuerra: c.nomeGuerra,
            telefone: c.telefone ?? null,
          });
        }
      } catch (err) {
        skipped++;
        inconsistencias.push(
          `Militar NF ${c.nf} (${c.nomeGuerra}) falhou: ${(err as Error).message}`,
        );
      }
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.chefeOperacoesEscala.deleteMany({});
        if (rows.length > 0) {
          const r = await tx.chefeOperacoesEscala.createMany({
            data: rows,
            skipDuplicates: true,
          });
          created = r.count;
        }
      });
      updated = 0; // replace-all sempre re-cria tudo
    } catch (err) {
      const msg = `Transaction ChOp falhou: ${(err as Error).message}`;
      this.logger.error(msg);
      inconsistencias.push(msg);
    }

    const result: SyncResult = {
      created,
      updated,
      skipped,
      inconsistencias,
      syncedAt: new Date().toISOString(),
    };
    this.lastSync = result;
    this.lastSyncAtMs = Date.now();
    this.logger.log(
      `ChOp sync OK: created=${created}, skipped=${skipped}, inconsistencias=${inconsistencias.length}`,
    );
    return result;
  }

  private async fetchAndParse() {
    const sheetId =
      this.config.get<string>('CHOP_SHEET_ID') ?? '1Nlr_uSNVD6dByaWPTL6IttSOa2nQPXO-m7FqTpeH8WI';
    const gid = this.config.get<string>('CHOP_SHEET_GID') ?? '1250546399';
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
      if (!res.ok) throw new Error(`HTTP ${res.status} ao baixar ChOp`);
      const csv = await res.text();
      const parsed = parseChefesOperacoesCsv(csv);
      if (parsed.length === 0) {
        throw new Error('ChOp retornou vazio após parse — provavelmente a estrutura mudou');
      }
      return parsed;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

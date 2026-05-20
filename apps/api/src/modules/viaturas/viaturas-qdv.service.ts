import { Injectable, Logger } from '@nestjs/common';
import type { ViaturaQdv } from '@argus/shared-types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ViaturasQdvImportService } from './viaturas-qdv-import.service';

/**
 * S2.10.9a — Lê QDV (aba `1BBM_1CIA`) de `prisma.viaturaQdv`.
 * Antes (S0.5): cache TTL 5min in-memory com fetch Google em runtime.
 * Agora: cron 00/06/12/18h + startup via `ViaturasQdvImportService`.
 */
@Injectable()
export class ViaturasQdvService {
  private readonly logger = new Logger(ViaturasQdvService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly importSvc: ViaturasQdvImportService,
  ) {}

  async listAll(): Promise<ViaturaQdv[]> {
    try {
      const rows = await this.prisma.viaturaQdv.findMany({ orderBy: { prefixo: 'asc' } });
      return rows.map(toShared);
    } catch (err) {
      this.logger.warn(`listAll falhou: ${(err as Error).message}. Retornando lista vazia.`);
      return [];
    }
  }

  async findByPrefixo(prefixo: string): Promise<ViaturaQdv | null> {
    try {
      const row = await this.prisma.viaturaQdv.findUnique({
        where: { prefixo: prefixo.trim().toUpperCase() },
      });
      return row ? toShared(row) : null;
    } catch {
      return null;
    }
  }

  /** S2.10.9a — Status delegado ao import service (counts em Postgres). */
  getSyncStatus(): { syncedAt: string | null; count: number; stale: boolean } {
    const s = this.importSvc.getSyncStatus();
    return {
      syncedAt: s.syncedAt,
      count: s.counts ? s.counts.created : 0,
      stale: s.stale,
    };
  }

  async forceSync(): Promise<{ syncedAt: string; count: number }> {
    const r = await this.importSvc.forceSync();
    return { syncedAt: r.syncedAt, count: r.created };
  }
}

function toShared(row: {
  prefixo: string;
  status: string | null;
  emprestadaA: string | null;
  kmAtual: number | null;
  observacao: string | null;
  empregoPrimario: string | null;
  empregoSecundario: string | null;
  placa: string | null;
  marcaModelo: string | null;
  combustivel: string | null;
  obm: string | null;
}): ViaturaQdv {
  return {
    prefixo: row.prefixo,
    status: row.status ?? undefined,
    emprestadaA: row.emprestadaA ?? undefined,
    kmAtual: row.kmAtual ?? undefined,
    observacao: row.observacao ?? undefined,
    empregoPrimario: row.empregoPrimario ?? undefined,
    empregoSecundario: row.empregoSecundario ?? undefined,
    placa: row.placa ?? undefined,
    marcaModelo: row.marcaModelo ?? undefined,
    combustivel: row.combustivel ?? undefined,
    obm: row.obm ?? undefined,
  };
}

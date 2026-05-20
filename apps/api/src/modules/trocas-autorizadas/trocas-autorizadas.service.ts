import { Injectable } from '@nestjs/common';
import type { TrocaAutorizada, TrocaStatus } from '@argus/shared-types';
import type { TrocaAutorizada as PrismaTrocaAutorizada } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TrocasAutorizadasImportService } from './trocas-autorizadas-import.service';

/**
 * S2.10.8b — Trocas Autorizadas (planilha externa do Comando) em Postgres.
 *
 * S2.10.9b — GETs são **Postgres-puros**: removido `syncIfStale()` fire-and-
 * forget para eliminar contenção Google×Postgres no caminho do request. Sync
 * acontece exclusivamente via cron 00/06/12/18h, startup e botão manual em
 * `/configuracoes/integracoes`. Lag máximo aceito: 6h (Tech Lead 2026-05-20;
 * regra de 2 dias de antecedência das trocas absorve o lag).
 */
@Injectable()
export class TrocasAutorizadasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly importSvc: TrocasAutorizadasImportService,
  ) {}

  async listAll(): Promise<TrocaAutorizada[]> {
    const rows = await this.prisma.trocaAutorizada.findMany({
      orderBy: [{ dataEscala: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toTrocaAutorizada);
  }

  async listByData(dataIso: string): Promise<TrocaAutorizada[]> {
    const rows = await this.prisma.trocaAutorizada.findMany({
      where: {
        OR: [{ dataEscala: dataIso }, { dataPagamento: dataIso }],
      },
      orderBy: [{ id: 'asc' }],
    });
    return rows.map(toTrocaAutorizada);
  }

  /**
   * S0.5/PR3 — Força resync admin. Delegado ao import service.
   */
  async forceSync(): Promise<{ syncedAt: string; count: number }> {
    const result = await this.importSvc.forceSync();
    return {
      syncedAt: result.syncedAt,
      count: result.created + result.updated,
    };
  }

  /** S0.5/PR2 — metadados para /configuracoes/integracoes. */
  getSyncStatus(): { syncedAt: string | null; count: number; stale: boolean } {
    const s = this.importSvc.getSyncStatus();
    const total = s.counts ? s.counts.created + s.counts.updated : 0;
    return { syncedAt: s.syncedAt, count: total, stale: s.stale };
  }
}

/** Conversão PrismaTrocaAutorizada → shared-types TrocaAutorizada. */
function toTrocaAutorizada(row: PrismaTrocaAutorizada): TrocaAutorizada {
  return {
    id: row.id,
    registradoEm: row.registradoEm,
    emailRegistrante: row.emailRegistrante ?? undefined,
    statusTroca: (row.statusTroca ?? undefined) as TrocaStatus | undefined,
    statusNome: row.statusNome ?? undefined,
    dataEscala: row.dataEscala,
    escaladoOriginal: row.escaladoOriginal,
    escaladoOriginalNf: row.escaladoOriginalNf ?? undefined,
    substituto: row.substituto,
    substitutoNf: row.substitutoNf ?? undefined,
    funcao: row.funcao,
    horario: row.horario,
    dataPagamento: row.dataPagamento,
    escaladoPagamento: row.escaladoPagamento,
    substitutoPagamento: row.substitutoPagamento,
    funcaoPagamento: row.funcaoPagamento,
    horarioPagamento: row.horarioPagamento,
    isDobra48h: row.isDobra48h,
    numeroEdocs: row.numeroEdocs ?? undefined,
    numeroRegistro: row.numeroRegistro ?? undefined,
  };
}

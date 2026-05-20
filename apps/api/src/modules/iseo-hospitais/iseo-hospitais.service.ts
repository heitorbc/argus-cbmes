import { Injectable, Logger } from '@nestjs/common';
import type {
  IseoHospitalEntry,
  IseoHospitalSyncStatus,
  IseoHospitalTurno,
  IseoHospitalUnidade,
} from '@argus/shared-types';
import type { IseoHospitalEntry as PrismaIseoHospitalEntry } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { IseoHospitaisImportService } from './iseo-hospitais-import.service';

/**
 * S2.10.8c — ISEO Hospitais (multi-sheet HPM + HIMABA × meses) em Postgres.
 *
 * S2.10.9b — GETs são **Postgres-puros**: removido `syncIfStale()` fire-and-
 * forget para eliminar contenção Google×Postgres no caminho do request. Sync
 * acontece exclusivamente via cron 00/06/12/18h, startup e botão manual em
 * `/configuracoes/integracoes`. Lag de 6h é aceitável: ISEO não é sensível
 * a sub-tempo real (apenas detecção de conflitos com outras escalas).
 */
@Injectable()
export class IseoHospitaisService {
  private readonly logger = new Logger(IseoHospitaisService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly importSvc: IseoHospitaisImportService,
  ) {}

  /** Lista todas as entradas (todas as unidades + meses combinados). */
  async list(): Promise<IseoHospitalEntry[]> {
    const rows = await this.prisma.iseoHospitalEntry.findMany({
      orderBy: [{ dataIso: 'asc' }, { unidade: 'asc' }, { turno: 'asc' }],
    });
    return rows.map(toEntry).filter((e): e is IseoHospitalEntry => e !== null);
  }

  async listByUnidade(unidade: IseoHospitalUnidade): Promise<IseoHospitalEntry[]> {
    const rows = await this.prisma.iseoHospitalEntry.findMany({
      where: { unidade },
      orderBy: [{ dataIso: 'asc' }, { turno: 'asc' }],
    });
    return rows.map(toEntry).filter((e): e is IseoHospitalEntry => e !== null);
  }

  async listDoDia(dataIso: string): Promise<IseoHospitalEntry[]> {
    const rows = await this.prisma.iseoHospitalEntry.findMany({
      where: { dataIso },
      orderBy: [{ unidade: 'asc' }, { turno: 'asc' }],
    });
    return rows.map(toEntry).filter((e): e is IseoHospitalEntry => e !== null);
  }

  async listByMilitar(nf: string): Promise<IseoHospitalEntry[]> {
    const rows = await this.prisma.iseoHospitalEntry.findMany({
      where: { nf },
      orderBy: [{ dataIso: 'asc' }],
    });
    return rows.map(toEntry).filter((e): e is IseoHospitalEntry => e !== null);
  }

  /**
   * S0.5/PR2 — Status por unidade (HPM + HIMABA). Agora derivado das
   * contagens em Postgres, não mais por aba. Mantém o shape antigo para
   * compatibilidade com o controller existente.
   */
  async getSyncStatus(): Promise<IseoHospitalSyncStatus[]> {
    const importStatus = this.importSvc.getSyncStatus();
    const [hpmCount, himabaCount] = await Promise.all([
      this.prisma.iseoHospitalEntry.count({ where: { unidade: 'HPM' } }),
      this.prisma.iseoHospitalEntry.count({ where: { unidade: 'HIMABA' } }),
    ]);
    return [
      {
        unidade: 'HPM',
        syncedAt: importStatus.syncedAt,
        count: hpmCount,
        stale: importStatus.stale,
      },
      {
        unidade: 'HIMABA',
        syncedAt: importStatus.syncedAt,
        count: himabaCount,
        stale: importStatus.stale,
      },
    ];
  }

  /**
   * S2.10.8a — Status agregado compatível com SourceConfig do
   * IntegracoesService. Agora reflete total em Postgres + status do
   * último sync.
   */
  async getSyncStatusAgregado(): Promise<{
    syncedAt: string | null;
    count: number;
    stale: boolean;
  }> {
    const importStatus = this.importSvc.getSyncStatus();
    // S2.10.8c-fix — try/catch defensivo. Em cold boot do Supabase a primeira
    // query Prisma pode falhar/timeout; sem este wrapper, a exceção sobe e
    // o IntegracoesService devolve HTTP 500 no menu inteiro.
    let count = 0;
    try {
      count = await this.prisma.iseoHospitalEntry.count();
    } catch (err) {
      this.logger.warn(
        `prisma.iseoHospitalEntry.count() falhou: ${(err as Error).message}. Retornando count=0.`,
      );
    }
    return { syncedAt: importStatus.syncedAt, count, stale: importStatus.stale };
  }

  /** Força resync admin via /configuracoes/integracoes (delegado ao import). */
  async forceSync(): Promise<IseoHospitalSyncStatus[]> {
    await this.importSvc.forceSync();
    return this.getSyncStatus();
  }

  /**
   * S2.10.8a — Adapter para SourceConfig: agrega total + syncedAt num
   * `{syncedAt, count}` único após forceSync do orchestrator.
   */
  async forceSyncAsSource(): Promise<{ syncedAt: string; count: number }> {
    const r = await this.importSvc.forceSync();
    const count = await this.prisma.iseoHospitalEntry.count();
    return { syncedAt: r.syncedAt, count };
  }
}

/**
 * Conversão PrismaIseoHospitalEntry → shared-types IseoHospitalEntry.
 * Rows sem `nf` são filtradas no caller (shared-types exige nf não-nulo).
 */
function toEntry(row: PrismaIseoHospitalEntry): IseoHospitalEntry | null {
  if (!row.nf) return null;
  return {
    unidade: row.unidade as IseoHospitalUnidade,
    posto: row.posto,
    nome: row.nome,
    nf: row.nf,
    dataIso: row.dataIso,
    turno: row.turno as IseoHospitalTurno,
    funcao: row.funcao ?? undefined,
    contato: row.contato ?? undefined,
    cargaHoraria: row.cargaHoraria ?? undefined,
    obm: row.obm ?? undefined,
    lotacao: row.lotacao ?? undefined,
  };
}

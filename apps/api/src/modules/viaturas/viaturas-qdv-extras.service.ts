import { Injectable, Logger } from '@nestjs/common';
import type { ContatoLogistico, ViaturaCbmes, ViaturaQdvBaseLista } from '@argus/shared-types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ViaturasQdvImportService } from './viaturas-qdv-import.service';

/**
 * S2.10.9a — Lê QDV extras (BASE_LISTA, BASE_VTR_LISTA_PRINCIPAL,
 * Contatos_LOGISTICAS) de Postgres. As 3 abas são sincronizadas pelo
 * `ViaturasQdvImportService` em ciclo único (multi-sheet).
 *
 * Status individual por aba mantido (o menu /integracoes mostrava 3
 * entradas distintas) — refletido a partir do `lastSync` do import.
 */
@Injectable()
export class ViaturasQdvExtrasService {
  private readonly logger = new Logger(ViaturasQdvExtrasService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly importSvc: ViaturasQdvImportService,
  ) {}

  async listBaseLista(): Promise<ViaturaQdvBaseLista[]> {
    try {
      const rows = await this.prisma.viaturaQdvBaseLista.findMany({
        orderBy: [{ obm: 'asc' }, { prefixo: 'asc' }],
      });
      return rows.map(toBaseLista);
    } catch (err) {
      this.logger.warn(`listBaseLista falhou: ${(err as Error).message}.`);
      return [];
    }
  }

  async listVtrPrincipal(): Promise<ViaturaCbmes[]> {
    try {
      const rows = await this.prisma.viaturaCbmes.findMany({
        orderBy: [{ obm: 'asc' }, { prefixo: 'asc' }],
      });
      return rows.map(toVtrPrincipal);
    } catch (err) {
      this.logger.warn(`listVtrPrincipal falhou: ${(err as Error).message}.`);
      return [];
    }
  }

  async listContatosLogisticas(): Promise<ContatoLogistico[]> {
    try {
      const rows = await this.prisma.contatoLogistico.findMany({
        orderBy: { obm: 'asc' },
      });
      return rows.map(toContato);
    } catch (err) {
      this.logger.warn(`listContatosLogisticas falhou: ${(err as Error).message}.`);
      return [];
    }
  }

  /**
   * Status agregado das 3 abas QDV extras. Como a sync é multi-sheet em
   * 1 ciclo, todas refletem o mesmo `syncedAt` — count vem de cada tabela.
   */
  async getSyncStatusBaseLista(): Promise<{
    syncedAt: string | null;
    count: number;
    stale: boolean;
  }> {
    const s = this.importSvc.getSyncStatus();
    const count = await this.safeCount(() => this.prisma.viaturaQdvBaseLista.count());
    return { syncedAt: s.syncedAt, count, stale: s.stale };
  }

  async getSyncStatusVtrPrincipal(): Promise<{
    syncedAt: string | null;
    count: number;
    stale: boolean;
  }> {
    const s = this.importSvc.getSyncStatus();
    const count = await this.safeCount(() => this.prisma.viaturaCbmes.count());
    return { syncedAt: s.syncedAt, count, stale: s.stale };
  }

  async getSyncStatusContatos(): Promise<{
    syncedAt: string | null;
    count: number;
    stale: boolean;
  }> {
    const s = this.importSvc.getSyncStatus();
    const count = await this.safeCount(() => this.prisma.contatoLogistico.count());
    return { syncedAt: s.syncedAt, count, stale: s.stale };
  }

  /** As 3 abas sincronizam juntas; cada forceSync chama o mesmo orchestrator. */
  async forceSyncBaseLista(): Promise<{ syncedAt: string; count: number }> {
    const r = await this.importSvc.forceSync();
    const count = await this.safeCount(() => this.prisma.viaturaQdvBaseLista.count());
    return { syncedAt: r.syncedAt, count };
  }

  async forceSyncVtrPrincipal(): Promise<{ syncedAt: string; count: number }> {
    const r = await this.importSvc.forceSync();
    const count = await this.safeCount(() => this.prisma.viaturaCbmes.count());
    return { syncedAt: r.syncedAt, count };
  }

  async forceSyncContatos(): Promise<{ syncedAt: string; count: number }> {
    const r = await this.importSvc.forceSync();
    const count = await this.safeCount(() => this.prisma.contatoLogistico.count());
    return { syncedAt: r.syncedAt, count };
  }

  private async safeCount(fn: () => Promise<number>): Promise<number> {
    try {
      return await fn();
    } catch {
      return 0;
    }
  }
}

function toBaseLista(row: {
  prefixo: string;
  obm: string;
  nomenclatura: string | null;
  ano: string | null;
  status: string | null;
  emprestadaA: string | null;
  kmAtual: number | null;
  observacao: string | null;
  empregoPrimario: string | null;
  empregoSecundario: string | null;
  placa: string | null;
  renavam: string | null;
  categoriaCnh: string | null;
  marcaModelo: string | null;
  combustivel: string | null;
  modeloPneu: string | null;
}): ViaturaQdvBaseLista {
  return {
    obm: row.obm,
    prefixo: row.prefixo,
    nomenclatura: row.nomenclatura ?? undefined,
    ano: row.ano ?? undefined,
    status: row.status ?? undefined,
    emprestadaA: row.emprestadaA ?? undefined,
    kmAtual: row.kmAtual ?? undefined,
    observacao: row.observacao ?? undefined,
    empregoPrimario: row.empregoPrimario ?? undefined,
    empregoSecundario: row.empregoSecundario ?? undefined,
    placa: row.placa ?? undefined,
    renavam: row.renavam ?? undefined,
    categoriaCnh: row.categoriaCnh ?? undefined,
    marcaModelo: row.marcaModelo ?? undefined,
    combustivel: row.combustivel ?? undefined,
    modeloPneu: row.modeloPneu ?? undefined,
  };
}

function toVtrPrincipal(row: {
  prefixo: string;
  prefixoComUnderscore: string;
  obm: string;
  nomenclatura: string | null;
  ano: string | null;
  idade: string | null;
  observacao: string | null;
  placa: string | null;
  renavam: string | null;
  categoriaCnh: string | null;
  tipoVeiculo: string | null;
  marcaModelo: string | null;
  combustivel: string | null;
  modeloPneu: string | null;
}): ViaturaCbmes {
  return {
    obm: row.obm,
    prefixoComUnderscore: row.prefixoComUnderscore,
    prefixo: row.prefixo,
    nomenclatura: row.nomenclatura ?? undefined,
    ano: row.ano ?? undefined,
    idade: row.idade ?? undefined,
    observacao: row.observacao ?? undefined,
    placa: row.placa ?? undefined,
    renavam: row.renavam ?? undefined,
    categoriaCnh: row.categoriaCnh ?? undefined,
    tipoVeiculo: row.tipoVeiculo ?? undefined,
    marcaModelo: row.marcaModelo ?? undefined,
    combustivel: row.combustivel ?? undefined,
    modeloPneu: row.modeloPneu ?? undefined,
  };
}

function toContato(row: {
  obm: string;
  nf: string;
  militarResponsavel: string;
  nomeCompleto: string | null;
  telefone: string | null;
  email: string | null;
}): ContatoLogistico {
  return {
    obm: row.obm,
    nf: row.nf,
    militarResponsavel: row.militarResponsavel,
    nomeCompleto: row.nomeCompleto ?? undefined,
    telefone: row.telefone ?? undefined,
    email: row.email ?? undefined,
  };
}

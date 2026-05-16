import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  type OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  CreateNotaServicoInput,
  NotaServico,
  UpdateNotaServicoInput,
} from '@argus/shared-types';
import { SheetsDbService } from '../sheets-db/sheets-db.service';
import { notaServicoToRow, rowToNotaServico } from '../sheets-db/sheets-db-serializers';

/**
 * S6l — CRUD de Notas de Serviço.
 *
 * S2.2 — Sheets-DB integration:
 * - `onModuleInit` carrega NS existentes da aba `bd_notas_servico`
 *   (sobrevive a restart do backend, ao contrário de Escalas que
 *   recarregam do XLSX).
 * - `create/update/remove` fazem dual-write para Sheets-DB.
 *
 * Persistência in-memory (Fase 1) keyed por `id`. Em S5b vira tabela
 * com índice por `data` e `codigo`.
 */
@Injectable()
export class NotasServicoService implements OnModuleInit {
  private readonly logger = new Logger(NotasServicoService.name);
  private readonly byId: Map<string, NotaServico> = new Map();

  constructor(@Optional() private readonly sheetsDb?: SheetsDbService) {}

  async onModuleInit(): Promise<void> {
    if (process.env.NODE_ENV === 'test') return;
    if (!this.sheetsDb?.isEnabled()) return;
    try {
      const rows = await this.sheetsDb.readNotasServico();
      let count = 0;
      for (const row of rows) {
        const ns = rowToNotaServico(row);
        if (ns) {
          this.byId.set(ns.id, ns);
          count++;
        }
      }
      this.logger.log(`Bootstrap NS: ${count} entradas carregadas do Sheets-DB.`);
    } catch (err) {
      this.logger.warn(
        `Bootstrap NS falhou (Sheets-DB): ${(err as Error).message}. Iniciando vazio.`,
      );
    }
  }

  list(filter: { data?: string; militarNf?: string } = {}): NotaServico[] {
    let result = Array.from(this.byId.values());
    if (filter.data) {
      result = result.filter((n) => n.data === filter.data);
    }
    if (filter.militarNf) {
      result = result.filter((n) => n.militaresNfs.includes(filter.militarNf!));
    }
    return result.sort((a, b) => {
      // mais recentes primeiro, depois por hora início
      const c = b.data.localeCompare(a.data);
      return c !== 0 ? c : a.horaInicio.localeCompare(b.horaInicio);
    });
  }

  findById(id: string): NotaServico {
    const n = this.byId.get(id);
    if (!n) throw new NotFoundException(`Nota de Serviço ${id} não encontrada`);
    return n;
  }

  /** Atalho para integração Prévia: NS aplicáveis a uma data. */
  listDoDia(dataIso: string): NotaServico[] {
    return this.list({ data: dataIso });
  }

  create(input: CreateNotaServicoInput, criadoPorNf: string): NotaServico {
    const now = new Date().toISOString();
    const ns: NotaServico = {
      id: `ns:${randomUUID()}`,
      codigo: input.codigo.trim(),
      descricao: input.descricao.trim(),
      data: input.data,
      horaInicio: input.horaInicio,
      horaFim: input.horaFim,
      viaturaPrefixo: input.viaturaPrefixo?.trim() || undefined,
      militaresNfs: input.militaresNfs,
      observacoes: input.observacoes?.trim() || undefined,
      criadoEm: now,
      criadoPorNf,
    };
    this.byId.set(ns.id, ns);
    this.syncToSheetsDb(ns);
    return ns;
  }

  /** Rejeita duplicata exata `(codigo, data)`. */
  createOrConflict(input: CreateNotaServicoInput, criadoPorNf: string): NotaServico {
    const existing = this.list({ data: input.data }).find((n) => n.codigo === input.codigo.trim());
    if (existing) {
      throw new ConflictException(`Já existe NS "${input.codigo}" para a data ${input.data}`);
    }
    return this.create(input, criadoPorNf);
  }

  update(id: string, input: UpdateNotaServicoInput): NotaServico {
    const current = this.findById(id);
    const updated: NotaServico = {
      ...current,
      codigo: input.codigo?.trim() ?? current.codigo,
      descricao: input.descricao?.trim() ?? current.descricao,
      data: input.data ?? current.data,
      horaInicio: input.horaInicio ?? current.horaInicio,
      horaFim: input.horaFim ?? current.horaFim,
      viaturaPrefixo: input.viaturaPrefixo?.trim() ?? current.viaturaPrefixo,
      militaresNfs: input.militaresNfs ?? current.militaresNfs,
      observacoes: input.observacoes?.trim() ?? current.observacoes,
    };
    this.byId.set(id, updated);
    this.syncToSheetsDb(updated);
    return updated;
  }

  remove(id: string): void {
    if (!this.byId.has(id)) {
      throw new NotFoundException(`Nota de Serviço ${id} não encontrada`);
    }
    this.byId.delete(id);
    this.deleteFromSheetsDb(id);
  }

  reset(): void {
    this.byId.clear();
  }

  private syncToSheetsDb(ns: NotaServico): void {
    if (!this.sheetsDb?.isEnabled()) return;
    void this.sheetsDb.upsertNotaServico(notaServicoToRow(ns)).catch((err) => {
      this.logger.warn(`Sheets-DB upsert NS ${ns.id} falhou: ${(err as Error).message}.`);
    });
  }

  private deleteFromSheetsDb(id: string): void {
    if (!this.sheetsDb?.isEnabled()) return;
    void this.sheetsDb.deleteNotaServico(id).catch((err) => {
      this.logger.warn(`Sheets-DB delete NS ${id} falhou: ${(err as Error).message}.`);
    });
  }
}

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  CreateNotaServicoInput,
  NotaServico,
  UpdateNotaServicoInput,
} from '@argus/shared-types';

/**
 * S6l — CRUD de Notas de Serviço.
 *
 * Persistência in-memory (Fase 1) keyed por `id`. Em S5b vira tabela com
 * índice por `data` e `codigo`.
 *
 * Idempotência: `createOrConflict` rejeita duplicata exata `(codigo, data)`.
 * Em produção real, `codigo` é único globalmente — mas aqui aceitamos
 * mesmo código em datas distintas (NS001 dia 1 e NS001 dia 2 são entradas
 * separadas — ainda que isso não seja a prática institucional, o schema
 * permite por simplicidade).
 */
@Injectable()
export class NotasServicoService {
  private readonly byId: Map<string, NotaServico> = new Map();

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
    return updated;
  }

  remove(id: string): void {
    if (!this.byId.has(id)) {
      throw new NotFoundException(`Nota de Serviço ${id} não encontrada`);
    }
    this.byId.delete(id);
  }

  reset(): void {
    this.byId.clear();
  }
}

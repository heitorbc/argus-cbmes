import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  atestadoAtivoNoDia,
  type Atestado,
  type CreateAtestadoInput,
  type UpdateAtestadoInput,
} from '@argus/shared-types';

/**
 * S6k — CRUD de Atestados médicos.
 *
 * Persistência in-memory (Fase 1) keyed por `id`. Em S5b vira tabela com
 * índice por `militarNf` e `dataInicio`.
 */
@Injectable()
export class AtestadosService {
  private readonly byId: Map<string, Atestado> = new Map();

  list(filter: { militarNf?: string; ano?: number } = {}): Atestado[] {
    let result = Array.from(this.byId.values());
    if (filter.militarNf) {
      result = result.filter((a) => a.militarNf === filter.militarNf);
    }
    if (filter.ano !== undefined) {
      result = result.filter((a) => Number(a.dataInicio.slice(0, 4)) === filter.ano);
    }
    return result.sort((a, b) => b.dataInicio.localeCompare(a.dataInicio));
  }

  findById(id: string): Atestado {
    const a = this.byId.get(id);
    if (!a) throw new NotFoundException(`Atestado ${id} não encontrado`);
    return a;
  }

  /** Lista atestados ativos em um dia específico (S6k integração Prévia). */
  listAtivosNoDia(dataIso: string): Atestado[] {
    return Array.from(this.byId.values())
      .filter((a) => atestadoAtivoNoDia(a, dataIso))
      .sort((a, b) => a.militarNf.localeCompare(b.militarNf));
  }

  create(input: CreateAtestadoInput, criadoPorNf: string): Atestado {
    const now = new Date().toISOString();
    const atestado: Atestado = {
      id: `atest:${randomUUID()}`,
      militarNf: input.militarNf,
      dataInicio: input.dataInicio,
      dias: input.dias,
      cid10: input.cid10,
      crmMedico: input.crmMedico,
      observacoes: input.observacoes?.trim() || undefined,
      criadoEm: now,
      criadoPorNf,
    };
    this.byId.set(atestado.id, atestado);
    return atestado;
  }

  update(id: string, input: UpdateAtestadoInput): Atestado {
    const current = this.findById(id);
    const updated: Atestado = {
      ...current,
      dataInicio: input.dataInicio ?? current.dataInicio,
      dias: input.dias ?? current.dias,
      cid10: input.cid10?.trim() ?? current.cid10,
      crmMedico: input.crmMedico?.trim() ?? current.crmMedico,
      observacoes: input.observacoes?.trim() ?? current.observacoes,
    };
    this.byId.set(id, updated);
    return updated;
  }

  remove(id: string): void {
    if (!this.byId.has(id)) {
      throw new NotFoundException(`Atestado ${id} não encontrado`);
    }
    this.byId.delete(id);
  }

  reset(): void {
    this.byId.clear();
  }
}

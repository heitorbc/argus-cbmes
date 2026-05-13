import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  dataInicioDefault,
  feriasAtivaNoDia,
  type CreateFeriasInput,
  type Ferias,
  type UpdateFeriasInput,
} from '@argus/shared-types';

/**
 * Item 4 — CRUD de Férias.
 *
 * Persistência in-memory keyed por `id`. Em S5b vira tabela com índice
 * por `militarNf + ano`.
 *
 * Idempotência: `createOrConflict` rejeita duplicata exata
 * `(militarNf, mesAno)` para impedir registros conflitantes no mesmo
 * mês previsto.
 */
@Injectable()
export class FeriasService {
  private readonly byId: Map<string, Ferias> = new Map();

  list(filter: { militarNf?: string; ano?: number } = {}): Ferias[] {
    let result = Array.from(this.byId.values());
    if (filter.militarNf) {
      result = result.filter((f) => f.militarNf === filter.militarNf);
    }
    if (filter.ano) {
      const ano = String(filter.ano);
      result = result.filter((f) => f.mesAno.startsWith(ano));
    }
    return result.sort((a, b) => b.mesAno.localeCompare(a.mesAno));
  }

  findById(id: string): Ferias {
    const f = this.byId.get(id);
    if (!f) throw new NotFoundException(`Férias ${id} não encontradas`);
    return f;
  }

  /** Lista férias ativas no dia (qualquer militar). Útil para Prévia. */
  listAtivasNoDia(dataIso: string): Ferias[] {
    return Array.from(this.byId.values()).filter((f) => feriasAtivaNoDia(f, dataIso));
  }

  create(input: CreateFeriasInput, criadoPorNf: string): Ferias {
    const now = new Date().toISOString();
    const f: Ferias = {
      id: `fer:${randomUUID()}`,
      militarNf: input.militarNf.trim(),
      mesAno: input.mesAno,
      dataInicio: input.dataInicio ?? dataInicioDefault(input.mesAno),
      dias: input.dias ?? 30,
      observacoes: input.observacoes?.trim() || undefined,
      criadoEm: now,
      criadoPorNf,
    };
    this.byId.set(f.id, f);
    return f;
  }

  /** Rejeita duplicata exata `(militarNf, mesAno)`. */
  createOrConflict(input: CreateFeriasInput, criadoPorNf: string): Ferias {
    const dup = this.list({ militarNf: input.militarNf }).find((f) => f.mesAno === input.mesAno);
    if (dup) {
      throw new ConflictException(
        `Já existe registro de férias para ${input.militarNf} em ${input.mesAno}`,
      );
    }
    return this.create(input, criadoPorNf);
  }

  update(id: string, input: UpdateFeriasInput): Ferias {
    const current = this.findById(id);
    const updated: Ferias = {
      ...current,
      mesAno: input.mesAno ?? current.mesAno,
      dataInicio:
        input.dataInicio ?? (input.mesAno ? dataInicioDefault(input.mesAno) : current.dataInicio),
      dias: input.dias ?? current.dias,
      observacoes: input.observacoes?.trim() ?? current.observacoes,
    };
    this.byId.set(id, updated);
    return updated;
  }

  remove(id: string): void {
    if (!this.byId.has(id)) {
      throw new NotFoundException(`Férias ${id} não encontradas`);
    }
    this.byId.delete(id);
  }

  reset(): void {
    this.byId.clear();
  }
}

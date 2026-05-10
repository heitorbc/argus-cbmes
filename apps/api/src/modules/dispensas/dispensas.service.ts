import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  calcularSaldoMilitar,
  dispensaAtivaNoDia,
  type CreateDispensaInput,
  type Dispensa,
  type DispensaSaldoMilitar,
  type UpdateDispensaInput,
} from '@argus/shared-types';

/**
 * S6j — CRUD de Dispensas + cálculo de saldo por militar/ano.
 *
 * Persistência in-memory (Fase 1) keyed por `id`. Em S5b vira tabela com
 * índice por `militarNf` e `dataInicio`.
 */
@Injectable()
export class DispensasService {
  private readonly byId: Map<string, Dispensa> = new Map();

  list(filter: { militarNf?: string; ano?: number } = {}): Dispensa[] {
    let result = Array.from(this.byId.values());
    if (filter.militarNf) {
      result = result.filter((d) => d.militarNf === filter.militarNf);
    }
    if (filter.ano !== undefined) {
      result = result.filter((d) => Number(d.dataInicio.slice(0, 4)) === filter.ano);
    }
    return result.sort((a, b) => b.dataInicio.localeCompare(a.dataInicio));
  }

  findById(id: string): Dispensa {
    const d = this.byId.get(id);
    if (!d) throw new NotFoundException(`Dispensa ${id} não encontrada`);
    return d;
  }

  /** Lista dispensas ativas em um dia específico (S6j integração Prévia). */
  listAtivasNoDia(dataIso: string): Dispensa[] {
    return Array.from(this.byId.values())
      .filter((d) => dispensaAtivaNoDia(d, dataIso))
      .sort((a, b) => a.militarNf.localeCompare(b.militarNf));
  }

  create(input: CreateDispensaInput, criadoPorNf: string): Dispensa {
    const now = new Date().toISOString();
    const dispensa: Dispensa = {
      id: `disp:${randomUUID()}`,
      militarNf: input.militarNf,
      tipo: input.tipo,
      dataInicio: input.dataInicio,
      dias: input.dias,
      numeroEdocs: input.numeroEdocs?.trim() || undefined,
      observacoes: input.observacoes?.trim() || undefined,
      criadoEm: now,
      criadoPorNf,
    };
    this.byId.set(dispensa.id, dispensa);
    return dispensa;
  }

  update(id: string, input: UpdateDispensaInput): Dispensa {
    const current = this.findById(id);
    const updated: Dispensa = {
      ...current,
      tipo: input.tipo ?? current.tipo,
      dataInicio: input.dataInicio ?? current.dataInicio,
      dias: input.dias ?? current.dias,
      numeroEdocs: input.numeroEdocs?.trim() ?? current.numeroEdocs,
      observacoes: input.observacoes?.trim() ?? current.observacoes,
    };
    this.byId.set(id, updated);
    return updated;
  }

  remove(id: string): void {
    if (!this.byId.has(id)) {
      throw new NotFoundException(`Dispensa ${id} não encontrada`);
    }
    this.byId.delete(id);
  }

  /** Saldo anual do militar (gozado, limite, restante por tipo). */
  saldoMilitar(militarNf: string, ano: number): DispensaSaldoMilitar {
    return calcularSaldoMilitar(this.list({ militarNf }), militarNf, ano);
  }

  /** Atalho: total de dias gozados no ano por todos os tipos. */
  totalDiasGozadosNoAno(militarNf: string, ano: number): number {
    return this.saldoMilitar(militarNf, ano).totalGozado;
  }

  /** Atalho operacional para tests / debug. */
  reset(): void {
    this.byId.clear();
  }

  /**
   * S6j — usado pela criação via ajuste pré-turno: previne duplicata exata
   * de (militar+tipo+dataInicio). Retorna a dispensa existente se já houver.
   */
  findByMilitarTipoDataInicio(
    militarNf: string,
    tipo: string,
    dataInicio: string,
  ): Dispensa | undefined {
    return Array.from(this.byId.values()).find(
      (d) => d.militarNf === militarNf && d.tipo === tipo && d.dataInicio === dataInicio,
    );
  }

  createOrConflict(input: CreateDispensaInput, criadoPorNf: string): Dispensa {
    const existing = this.findByMilitarTipoDataInicio(
      input.militarNf,
      input.tipo,
      input.dataInicio,
    );
    if (existing) {
      throw new ConflictException(
        `Já existe dispensa do tipo ${input.tipo} para NF ${input.militarNf} iniciando em ${input.dataInicio}`,
      );
    }
    return this.create(input, criadoPorNf);
  }
}

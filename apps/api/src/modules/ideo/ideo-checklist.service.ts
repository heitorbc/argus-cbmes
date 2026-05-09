import { Injectable } from '@nestjs/common';
import type { IdeoChecklistEntry, MarkIdeoChecklistInput, TipoIdeo } from '@argus/shared-types';

/**
 * Marcações de "realizado/não realizado" por item IDEO em um dia específico.
 *
 * Cada `data + tipo + item` é uma chave única. Usado pela Conferência da Equipe (S6 — UI ainda
 * pendente) e impresso na Parte Diária (S10/S11). Em S5 só temos backend.
 *
 * Mock in-memory; migra para Prisma em S5b.
 */
@Injectable()
export class IdeoChecklistService {
  private readonly entries: Map<string, IdeoChecklistEntry> = new Map();

  /** Lista todas as marcações de uma data específica. */
  list(data: string): IdeoChecklistEntry[] {
    return [...this.entries.values()].filter((e) => e.data === data);
  }

  /** Atalho: dado data+tipo, retorna mapa item→entry. */
  byTipo(data: string, tipo: TipoIdeo): Map<string, IdeoChecklistEntry> {
    const out = new Map<string, IdeoChecklistEntry>();
    for (const e of this.entries.values()) {
      if (e.data === data && e.tipo === tipo) out.set(e.item, e);
    }
    return out;
  }

  /** Marca/desmarca um item. Idempotente. */
  mark(input: MarkIdeoChecklistInput, marcadoPorNf?: string): IdeoChecklistEntry {
    const entry: IdeoChecklistEntry = {
      data: input.data,
      tipo: input.tipo,
      item: input.item,
      realizado: input.realizado,
      marcadoPorNf,
      marcadoEm: new Date().toISOString(),
    };
    this.entries.set(IdeoChecklistService.key(input.data, input.tipo, input.item), entry);
    return entry;
  }

  /** Reseta todas as marcações de uma data (útil em testes). */
  reset(data: string): number {
    let count = 0;
    for (const k of [...this.entries.keys()]) {
      const v = this.entries.get(k);
      if (v?.data === data) {
        this.entries.delete(k);
        count++;
      }
    }
    return count;
  }

  private static key(data: string, tipo: TipoIdeo, item: string): string {
    return `${data}|${tipo}|${item}`;
  }
}

import { Injectable } from '@nestjs/common';
import type { IdeoEntry, IdeoMatrix, TipoIdeo, UpsertIdeoEntryInput } from '@argus/shared-types';

/**
 * Tabela IDEO (Itens Diários de Entrega Operacional) — rotativa por dia do mês.
 * Em S5 migra para Prisma. Em Fase 1, mock in-memory + reset on restart.
 *
 * RF-CM-115 do PRD v2.0 (promovido a [MUST] em S2.5).
 */
@Injectable()
export class IdeoService {
  /** Map keyed by `${dia}:${tipo}` → entry. */
  private readonly entries: Map<string, IdeoEntry> = new Map();

  list(): IdeoMatrix {
    return { entries: Array.from(this.entries.values()) };
  }

  get(dia: number, tipo: TipoIdeo): IdeoEntry | null {
    return this.entries.get(IdeoService.key(dia, tipo)) ?? null;
  }

  upsert(input: UpsertIdeoEntryInput, atualizadoPorNf?: string): IdeoEntry {
    const entry: IdeoEntry = {
      dia: input.dia,
      tipo: input.tipo,
      itens: input.itens,
      atualizadoEm: new Date().toISOString(),
      atualizadoPorNf,
    };
    this.entries.set(IdeoService.key(input.dia, input.tipo), entry);
    return entry;
  }

  delete(dia: number, tipo: TipoIdeo): void {
    this.entries.delete(IdeoService.key(dia, tipo));
  }

  private static key(dia: number, tipo: TipoIdeo): string {
    return `${dia}:${tipo}`;
  }
}

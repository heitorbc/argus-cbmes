import { Injectable } from '@nestjs/common';
import type { IdeoStatusDoDia, TipoIdeo, UpsertIdeoStatusInput } from '@argus/shared-types';

/**
 * S6i — Status de realização da IDEO por dia/tipo (ABTS/RESGATE).
 *
 * Persistência in-memory (Fase 1) keyed por `data|tipo`. Em S5b vira tabela.
 * Atestado pelo Fiscal de Serviço (campo `fiscalNf` registrado no upsert).
 */
@Injectable()
export class IdeoStatusService {
  private readonly byKey: Map<string, IdeoStatusDoDia> = new Map();

  upsert(data: string, input: UpsertIdeoStatusInput, fiscalNf: string): IdeoStatusDoDia {
    const key = entryKey(data, input.tipo);
    const status: IdeoStatusDoDia = {
      data,
      tipo: input.tipo,
      realizada: input.realizada,
      motivoNaoRealizacao: input.realizada ? undefined : input.motivoNaoRealizacao,
      fiscalNf,
      geradoEm: new Date().toISOString(),
    };
    this.byKey.set(key, status);
    return status;
  }

  getByData(data: string): IdeoStatusDoDia[] {
    return Array.from(this.byKey.values()).filter((s) => s.data === data);
  }

  getByDataTipo(data: string, tipo: TipoIdeo): IdeoStatusDoDia | undefined {
    return this.byKey.get(entryKey(data, tipo));
  }

  reset(data?: string): void {
    if (!data) {
      this.byKey.clear();
      return;
    }
    for (const k of Array.from(this.byKey.keys())) {
      if (k.startsWith(`${data}|`)) this.byKey.delete(k);
    }
  }
}

function entryKey(data: string, tipo: TipoIdeo): string {
  return `${data}|${tipo}`;
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  checklistPadraoPorTipo,
  type ConferenciaMateriaisDoDia,
  type RegistrarConferenciaMateriaisInput,
  type TipoViatura,
} from '@argus/shared-types';
import { ViaturasService } from '../viaturas/viaturas.service';

/**
 * S8 — Conferência de Materiais por viatura.
 *
 * Persistência in-memory keyed por `data + vtrPrefixo` — última conferência
 * sobrescreve a anterior (não há histórico em Fase 1). Em S5b vira tabela.
 */
@Injectable()
export class MateriaisService {
  private readonly byData: Map<string, Map<string, ConferenciaMateriaisDoDia>> = new Map();

  constructor(private readonly viaturas: ViaturasService) {}

  /**
   * Devolve o checklist padrão a apresentar para uma viatura. Resolve o
   * tipo via `Viatura.tipo` e busca no mapa hardcoded de shared-types.
   */
  async getChecklistPadrao(vtrPrefixo: string): Promise<readonly string[]> {
    const vtr = await this.viaturas.findByPrefixo(vtrPrefixo);
    if (!vtr) {
      throw new NotFoundException(`Viatura ${vtrPrefixo} não encontrada`);
    }
    return checklistPadraoPorTipo(vtr.tipo as TipoViatura);
  }

  /** Conferência mais recente de 1 viatura em 1 data, ou null. */
  get(dataIso: string, vtrPrefixo: string): ConferenciaMateriaisDoDia | null {
    return this.byData.get(dataIso)?.get(vtrPrefixo) ?? null;
  }

  /** Todas as conferências de 1 data (todas as viaturas). */
  listByData(dataIso: string): ConferenciaMateriaisDoDia[] {
    const m = this.byData.get(dataIso);
    return m ? Array.from(m.values()) : [];
  }

  registrar(
    input: RegistrarConferenciaMateriaisInput,
    registradoPorNf: string,
  ): ConferenciaMateriaisDoDia {
    const entry: ConferenciaMateriaisDoDia = {
      id: `mat:${randomUUID()}`,
      data: input.data,
      vtrPrefixo: input.vtrPrefixo.trim(),
      itens: input.itens,
      registradoPorNf,
      registradoEm: new Date().toISOString(),
    };
    let byVtr = this.byData.get(input.data);
    if (!byVtr) {
      byVtr = new Map();
      this.byData.set(input.data, byVtr);
    }
    byVtr.set(entry.vtrPrefixo, entry);
    return entry;
  }

  /**
   * Helper de relatório: itens com status ≠ OK de TODAS as viaturas do dia,
   * já formatados para uso em PD (seção "ALTERAÇÃO DE ALMOXARIFADO").
   */
  listarPendenciasDoDia(
    dataIso: string,
  ): Array<{ vtrPrefixo: string; label: string; status: string; observacao?: string }> {
    const all = this.listByData(dataIso);
    const out: Array<{ vtrPrefixo: string; label: string; status: string; observacao?: string }> =
      [];
    for (const c of all) {
      for (const item of c.itens) {
        if (item.status !== 'OK') {
          out.push({
            vtrPrefixo: c.vtrPrefixo,
            label: item.label,
            status: item.status,
            observacao: item.observacao,
          });
        }
      }
    }
    return out;
  }

  reset(): void {
    this.byData.clear();
  }
}

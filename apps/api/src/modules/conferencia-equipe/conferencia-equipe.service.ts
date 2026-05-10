import { Injectable } from '@nestjs/common';
import type { ConferenciaEquipeEntry, UpsertConferenciaEquipeInput } from '@argus/shared-types';
import { ServicoService } from '../servico/servico.service';

/**
 * Conferência da Equipe (S6b/F3).
 *
 * O Chefe da Equipe rotativa do dia marca presença/substituição/ausência de
 * cada militar da composição. Quando todas as marcações estão != 'pendente',
 * o Servico transiciona para EQUIPE_CONFERIDA.
 *
 * Mock in-memory keyed por dataIso, indexado por
 * `recurso|funcao|militarOriginalNf` (única chave canônica do militar
 * dentro do MF).
 */
@Injectable()
export class ConferenciaEquipeService {
  private readonly byData: Map<string, Map<string, ConferenciaEquipeEntry>> = new Map();

  constructor(private readonly servico: ServicoService) {}

  getByData(dataIso: string): ConferenciaEquipeEntry[] {
    const m = this.byData.get(dataIso);
    return m ? Array.from(m.values()) : [];
  }

  /**
   * Atualização em lote (PUT). O Chefe envia toda a lista de marcações de
   * uma vez. Substitui completamente o estado da data.
   */
  bulkUpdate(
    dataIso: string,
    input: UpsertConferenciaEquipeInput,
    marcadoPorNf: string,
  ): ConferenciaEquipeEntry[] {
    const map = new Map<string, ConferenciaEquipeEntry>();
    const now = new Date().toISOString();
    for (const e of input.entries) {
      const key = entryKey(e.recurso, e.funcao, e.militarOriginalNf);
      map.set(key, {
        ...e,
        marcadoEm: now,
        marcadoPorNf,
      });
    }
    this.byData.set(dataIso, map);
    this.maybePromover(dataIso);
    return Array.from(map.values());
  }

  /** Marcação granular (1 militar). Útil para UI offline-first ou ad-hoc. */
  marcarPresenca(
    dataIso: string,
    entry: Omit<ConferenciaEquipeEntry, 'marcadoEm' | 'marcadoPorNf'>,
    marcadoPorNf: string,
  ): ConferenciaEquipeEntry {
    const map = this.byData.get(dataIso) ?? new Map<string, ConferenciaEquipeEntry>();
    const key = entryKey(entry.recurso, entry.funcao, entry.militarOriginalNf);
    const updated: ConferenciaEquipeEntry = {
      ...entry,
      marcadoEm: new Date().toISOString(),
      marcadoPorNf,
    };
    map.set(key, updated);
    this.byData.set(dataIso, map);
    this.maybePromover(dataIso);
    return updated;
  }

  /**
   * Se todas as marcações da data estão != 'pendente' E há ao menos uma
   * marcação registrada, promove o Servico para EQUIPE_CONFERIDA.
   *
   * Não promove se ainda houver pendentes (regra explícita: "todos os
   * militares devem ter status definido"). Não falha se Servico ainda
   * não foi iniciado — o backend permite registrar marcações antes do
   * início (raro, mas útil para reset).
   */
  private maybePromover(dataIso: string): void {
    const m = this.byData.get(dataIso);
    if (!m || m.size === 0) return;
    const todasResolvidas = Array.from(m.values()).every((e) => e.statusConferencia !== 'pendente');
    if (!todasResolvidas) return;
    const estado = this.servico.get(dataIso);
    if (estado.estado === 'INICIADO' || estado.estado === 'VIATURA_CONFERIDA') {
      try {
        this.servico.marcarEquipeConferida(dataIso);
      } catch {
        // Idempotente — ignora se já promovido.
      }
    }
  }

  reset(dataIso?: string): void {
    if (dataIso) this.byData.delete(dataIso);
    else this.byData.clear();
  }
}

function entryKey(recurso: string, funcao: string, militarNf: string): string {
  return `${recurso}|${funcao}|${militarNf}`;
}

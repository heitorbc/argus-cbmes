import { Injectable } from '@nestjs/common';
import type { ConferenciaViaturaEntry, UpsertConferenciaViaturaInput } from '@argus/shared-types';
import { ServicoService } from '../servico/servico.service';
import { ViaturasService } from '../viaturas/viaturas.service';

/**
 * Conferência da Viatura (S6b/F4).
 *
 * O Motorista da viatura registra KM atual, estado do tanque, observação,
 * e opcionalmente muda o status. A operação:
 *   1. Atualiza a Viatura via `ViaturasService.aplicarConferencia()` (que
 *      bypassa o bloqueio ADR-009 — esta é a "porta" autorizada).
 *   2. Persiste a marcação por dataIso/vtrPrefixo.
 *   3. Se mudou status para BAIXADA durante o serviço, registra
 *      `AlteracaoDiversa` (S6b/F6).
 *   4. Quando todas as viaturas da composicaoMf forem conferidas, transiciona
 *      o Servico para `VIATURA_CONFERIDA`.
 */
@Injectable()
export class ConferenciaViaturaService {
  private readonly byData: Map<string, Map<string, ConferenciaViaturaEntry>> = new Map();

  constructor(
    private readonly servico: ServicoService,
    private readonly viaturas: ViaturasService,
  ) {}

  getByData(dataIso: string): ConferenciaViaturaEntry[] {
    const m = this.byData.get(dataIso);
    return m ? Array.from(m.values()) : [];
  }

  async registrar(
    dataIso: string,
    vtrPrefixo: string,
    input: UpsertConferenciaViaturaInput,
    registradoPorNf: string,
  ): Promise<ConferenciaViaturaEntry> {
    const viaturaAntes = await this.viaturas.findByPrefixo(vtrPrefixo);
    const statusAnterior = viaturaAntes?.status;

    await this.viaturas.aplicarConferencia(vtrPrefixo, { ...input, vtrPrefixo }, registradoPorNf);

    const now = new Date().toISOString();
    const entry: ConferenciaViaturaEntry = {
      ...input,
      vtrPrefixo,
      registradoEm: now,
      registradoPorNf,
    };

    const map = this.byData.get(dataIso) ?? new Map<string, ConferenciaViaturaEntry>();
    map.set(vtrPrefixo, entry);
    this.byData.set(dataIso, map);

    // Se status mudou durante o serviço, registra AlteracaoDiversa
    if (
      input.statusMudanca &&
      statusAnterior &&
      input.statusMudanca !== statusAnterior &&
      this.servico.get(dataIso).estado !== 'NAO_INICIADO'
    ) {
      this.servico.addAlteracao(
        dataIso,
        {
          tipo: 'mudanca_viatura',
          vtrPrefixo,
          statusViaturaAnterior: statusAnterior,
          statusViaturaNovo: input.statusMudanca,
          motivo: input.motivoBaixa,
          observacao: input.observacao,
        },
        registradoPorNf,
      );
    }

    return entry;
  }

  reset(dataIso?: string): void {
    if (dataIso) this.byData.delete(dataIso);
    else this.byData.clear();
  }
}

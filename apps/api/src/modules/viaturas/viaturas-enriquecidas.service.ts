import { Injectable } from '@nestjs/common';
import type { ContatoLogistico, ViaturaEnriquecida } from '@argus/shared-types';
import { ViaturasService } from './viaturas.service';
import { ViaturasQdvService } from './viaturas-qdv.service';
import { ViaturasQdvExtrasService } from './viaturas-qdv-extras.service';

/**
 * S0.x — Visão consolidada de viaturas para `/cadastros/viaturas`.
 *
 * Lista vem do **QDV aba 1BBM_1CIA** (fonte de verdade da unidade),
 * enriquecida com:
 *   - QDV/BASE_LISTA (renavam, modelo pneu, ano, nomenclatura, CNH)
 *   - Mapa Força (status diário oficial DISPONIVEL/BAIXADA/EMPRESTADA)
 *
 * Contato logístico responsável da unidade vem da aba `Contatos_LOGISTICAS`
 * via método separado `getContatoResponsavel()` (1 entry por OBM).
 */
@Injectable()
export class ViaturasEnriquecidasService {
  constructor(
    private readonly viaturas: ViaturasService,
    private readonly viaturasQdv: ViaturasQdvService,
    private readonly viaturasQdvExtras: ViaturasQdvExtrasService,
  ) {}

  async listEnriquecidas(): Promise<ViaturaEnriquecida[]> {
    const [qdv, baseLista, mfList] = await Promise.all([
      this.viaturasQdv.listAll().catch(() => []),
      this.viaturasQdvExtras.listBaseLista().catch(() => []),
      this.viaturas.list().catch(() => []),
    ]);

    // Index BASE_LISTA por prefixo normalizado (filtra apenas 1BBM/1ªCIA)
    const baseListaByPrefixo = new Map(
      baseLista
        .filter((b) => b.obm.includes('1ºBBM/1ªCIA') || b.obm.includes('1BBM/1ªCIA'))
        .map((b) => [normalizePrefixo(b.prefixo), b]),
    );

    // Index do MF por prefixo normalizado para sobrepor status oficial
    const mfByPrefixo = new Map(mfList.map((v) => [normalizePrefixo(v.prefixo), v]));

    return qdv.map((q): ViaturaEnriquecida => {
      const norm = normalizePrefixo(q.prefixo);
      const base = baseListaByPrefixo.get(norm);
      const mf = mfByPrefixo.get(norm);
      return {
        prefixo: q.prefixo,
        obm: q.obm ?? base?.obm ?? '',
        nomenclatura: base?.nomenclatura,
        ano: base?.ano,
        statusQdv: q.status,
        statusMf: mf?.status ?? null,
        emprestadaA: q.emprestadaA ?? base?.emprestadaA,
        kmAtual: q.kmAtual ?? base?.kmAtual,
        observacao: q.observacao ?? base?.observacao,
        empregoPrimario: q.empregoPrimario ?? base?.empregoPrimario,
        empregoSecundario: q.empregoSecundario ?? base?.empregoSecundario,
        placa: q.placa ?? base?.placa,
        renavam: base?.renavam,
        categoriaCnh: base?.categoriaCnh,
        marcaModelo: q.marcaModelo ?? base?.marcaModelo,
        combustivel: q.combustivel ?? base?.combustivel,
        modeloPneu: base?.modeloPneu,
      };
    });
  }

  /**
   * Retorna o contato logístico da 1ª Cia/1º BBM (1 ou poucos por OBM).
   * Frontend exibe 1× no footer da página de viaturas (não por linha).
   */
  async getContatoResponsavel1aCia(): Promise<ContatoLogistico | null> {
    const todos = await this.viaturasQdvExtras.listContatosLogisticas().catch(() => []);
    return (
      todos.find(
        (c) => c.obm.includes('1ºBBM/1ªCIA') || c.obm.includes('1BBM/1ªCIA'),
      ) ?? null
    );
  }
}

function normalizePrefixo(p: string): string {
  return p.toUpperCase().replace(/[\s_]/g, '');
}

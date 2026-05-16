import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  ContatoLogistico,
  Viatura,
  ViaturaDetalhe,
  ViaturaEnriquecida,
} from '@argus/shared-types';
import { ViaturasService } from './viaturas.service';
import { ViaturasQdvService } from './viaturas-qdv.service';
import { ViaturasQdvExtrasService } from './viaturas-qdv-extras.service';

/**
 * S0.x — Visão consolidada de viaturas para `/cadastros/viaturas`.
 *
 * Lista vem do **QDV aba 1BBM_1CIA** (fonte de verdade da unidade),
 * enriquecida com:
 *   - QDV/BASE_LISTA (renavam, modelo pneu, ano, nomenclatura, CNH)
 *   - QDV/BASE_VTR_LISTA_PRINCIPAL (tipo veículo CBMES)
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
    const [qdv, baseLista, vtrPrincipal, mfList] = await Promise.all([
      this.viaturasQdv.listAll().catch(() => []),
      this.viaturasQdvExtras.listBaseLista().catch(() => []),
      this.viaturasQdvExtras.listVtrPrincipal().catch(() => []),
      this.viaturas.list().catch(() => []),
    ]);

    // Index BASE_LISTA por prefixo normalizado (filtra apenas 1BBM/1ªCIA)
    const baseListaByPrefixo = new Map(
      baseLista
        .filter((b) => b.obm.includes('1ºBBM/1ªCIA') || b.obm.includes('1BBM/1ªCIA'))
        .map((b) => [normalizePrefixo(b.prefixo), b]),
    );

    // BASE_VTR_LISTA_PRINCIPAL: tem TODAS as VTRs do CBMES; indexa por prefixo
    // normalizado (filtra 1BBM/1ªCIA para minimizar colisões).
    const vtrPrincipalByPrefixo = new Map(
      vtrPrincipal
        .filter((v) => v.obm.includes('1ºBBM/1ªCIA') || v.obm.includes('1BBM/1ªCIA'))
        .map((v) => [normalizePrefixo(v.prefixo), v]),
    );

    // Index do MF por prefixo normalizado para sobrepor status oficial
    const mfByPrefixo = new Map(mfList.map((v) => [normalizePrefixo(v.prefixo), v]));

    return qdv.map((q): ViaturaEnriquecida => {
      const norm = normalizePrefixo(q.prefixo);
      const base = baseListaByPrefixo.get(norm);
      const vtrCbmes = vtrPrincipalByPrefixo.get(norm);
      const mf = mfByPrefixo.get(norm);
      return {
        prefixo: q.prefixo,
        obm: q.obm ?? base?.obm ?? vtrCbmes?.obm ?? '',
        nomenclatura: base?.nomenclatura ?? vtrCbmes?.nomenclatura,
        ano: base?.ano ?? vtrCbmes?.ano,
        statusQdv: q.status,
        statusMf: mf?.status ?? null,
        emprestadaA: q.emprestadaA ?? base?.emprestadaA,
        kmAtual: q.kmAtual ?? base?.kmAtual,
        observacao: q.observacao ?? base?.observacao ?? vtrCbmes?.observacao,
        empregoPrimario: q.empregoPrimario ?? base?.empregoPrimario,
        empregoSecundario: q.empregoSecundario ?? base?.empregoSecundario,
        placa: q.placa ?? base?.placa ?? vtrCbmes?.placa,
        renavam: base?.renavam ?? vtrCbmes?.renavam,
        categoriaCnh: base?.categoriaCnh ?? vtrCbmes?.categoriaCnh,
        tipoVeiculo: vtrCbmes?.tipoVeiculo,
        marcaModelo: q.marcaModelo ?? base?.marcaModelo ?? vtrCbmes?.marcaModelo,
        combustivel: q.combustivel ?? base?.combustivel ?? vtrCbmes?.combustivel,
        modeloPneu: base?.modeloPneu ?? vtrCbmes?.modeloPneu,
      };
    });
  }

  /**
   * S0.x — Detalhe único por prefixo, consumido por `/cadastros/viaturas/:prefixo`.
   * Combina a visão enriquecida (QDV + BASE_LISTA + VTR_PRINCIPAL + MF) com
   * o override interno (Viatura — campos editáveis: KM histórico, ARLA32,
   * capacidades, observações) e o contato logístico da unidade.
   */
  async getDetalhe(prefixo: string): Promise<ViaturaDetalhe> {
    const items = await this.listEnriquecidas();
    const normTarget = normalizePrefixo(prefixo);
    const qdv = items.find((i) => normalizePrefixo(i.prefixo) === normTarget);
    if (!qdv) {
      throw new NotFoundException(
        `Viatura "${prefixo}" não está cadastrada na aba 1BBM_1CIA da QDV.`,
      );
    }
    const [interno, contatoResponsavel] = await Promise.all([
      this.findInternoByPrefixo(qdv.prefixo),
      this.getContatoResponsavel1aCia(),
    ]);
    return { qdv, interno, contatoResponsavel };
  }

  /**
   * Retorna o contato logístico da 1ª Cia/1º BBM (1 ou poucos por OBM).
   * Frontend exibe 1× no header da página de viaturas (não por linha).
   */
  async getContatoResponsavel1aCia(): Promise<ContatoLogistico | null> {
    const todos = await this.viaturasQdvExtras.listContatosLogisticas().catch(() => []);
    return todos.find((c) => c.obm.includes('1ºBBM/1ªCIA') || c.obm.includes('1BBM/1ªCIA')) ?? null;
  }

  private async findInternoByPrefixo(prefixo: string): Promise<Viatura | null> {
    const normTarget = normalizePrefixo(prefixo);
    const all = await this.viaturas.list().catch(() => []);
    return all.find((v) => normalizePrefixo(v.prefixo) === normTarget) ?? null;
  }
}

function normalizePrefixo(p: string): string {
  return p.toUpperCase().replace(/[\s_]/g, '');
}

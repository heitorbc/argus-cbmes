import { Injectable } from '@nestjs/common';
import {
  LETRA_EQUIPE_LABEL,
  TIPO_IDEO,
  type ComposicaoEntry,
  type ComposicaoMfEntry,
  type ComposicaoMfMilitar,
  type LetraEquipe,
  type LetraEquipeRotativa,
  type Militar,
  type PreviaDoDia,
  type PreviaFiscal,
  type PreviaIdeoEntry,
  type PreviaInconsistencia,
  type PreviaTripulacaoEntry,
  type StatusViatura,
  type TipoIdeo,
} from '@argus/shared-types';
import { ChefesOperacoesService } from '../chefes-operacoes/chefes-operacoes.service';
import { EfetivoService } from '../efetivo/efetivo.service';
import { EscalasService } from '../escalas/escalas.service';
import { EscalasEspeciaisService } from '../escalas-especiais/escalas-especiais.service';
import { FiscaisService } from '../fiscais/fiscais.service';
import { IdeoService } from '../ideo/ideo.service';
import { ServicoService } from '../servico/servico.service';
import { ViaturasService } from '../viaturas/viaturas.service';
import { AjustesPreviaService } from './ajustes-previa.service';
import { NomeMatcher } from './nome-matching';

/**
 * Orquestra a geração da Prévia do Mapa Força para uma data.
 *
 * Fontes consolidadas:
 *   - EscalasService: equipe escalada (A/B/C/D) + composição rotativa (parsed XLSX, S3b)
 *   - MapaForcaService: status real das viaturas (S5). NÃO usado para militares —
 *     S6g/2026-05-10 removeu o complemento de militares vindos do MF
 *     (`buildComplementosFromMapaForca`). Tripulação vem 100% da Escala XLSX da SOS.
 *   - EfetivoService (consolidado QDI+EFETIVO): resolução nome→NF (S2.5)
 *   - FiscaisService: cadastros override (S3a)
 *   - IdeoService: itens do dia por tipo (S3a)
 *   - ViaturasService: lista de viaturas operacionais (status real do MF, S5)
 *   - ChefesOperacoesService: planilha externa (NÃO o MF da CIODES) — S6a-fix item 6
 */
@Injectable()
export class PreviaService {
  constructor(
    private readonly escalas: EscalasService,
    private readonly efetivo: EfetivoService,
    private readonly fiscais: FiscaisService,
    private readonly ideo: IdeoService,
    private readonly viaturas: ViaturasService,
    private readonly ajustes: AjustesPreviaService,
    private readonly escalasEspeciais: EscalasEspeciaisService,
    private readonly chefesOperacoes: ChefesOperacoesService,
    private readonly servico: ServicoService,
  ) {}

  async getPreviaDoDia(dataIso: string): Promise<PreviaDoDia> {
    const [ano, mes, dia] = parseDataIso(dataIso);
    const inconsistencias: PreviaInconsistencia[] = [];

    const escala = this.escalas.get(ano, mes);
    if (!escala) {
      inconsistencias.push({
        tipo: 'SEM_ESCALA_NO_MES',
        mensagem: `Não há escala importada para ${String(mes).padStart(2, '0')}/${ano}. Importe o XLSX em /cadastros/escalas.`,
      });
    }

    const escalados = this.escalas.getEscaladosDoDia(ano, mes, dataIso);
    const equipe = escalados.equipe;
    if (escala && !equipe) {
      inconsistencias.push({
        tipo: 'EQUIPE_NAO_ESCALADA_NO_DIA',
        mensagem: `Não há equipe escalada para ${dataIso} no XLSX importado.`,
      });
    }

    // Resolução nome→NF cruzando com efetivo consolidado.
    // S6c/F1: NomeMatcher precisa de TODOS os militares (DADOS+1ª1º+EFETIVO)
    // para resolver militares que estão nas escalas mas ainda não foram
    // lançados no QDI 1ª1º (DRH atrasado). A página /cadastros/efetivo continua
    // filtrada (somente1aCia=true sem incluirEfetivoOrfao).
    const efetivoTotal = await this.efetivo.getAll({
      somente1aCia: false,
      incluirEfetivoOrfao: true,
    });
    const matcher = new NomeMatcher(efetivoTotal);

    // S6g (2026-05-10) — Tripulação vem 100% da Escala XLSX da SOS. O complemento
    // via MF (`buildComplementosFromMapaForca`) foi removido: militares do MF
    // (chefe/motorista/operadores das colunas D-J) NÃO entram mais na Prévia.
    // Do MF continuam vindo apenas: status das viaturas (vtrStatus) e a whitelist
    // de Recursos válidos. Sem XLSX importado, `tripulacao` fica vazia.
    const tripulacao: PreviaTripulacaoEntry[] = escalados.entries.map((entry) =>
      this.buildTripulacaoEntry(entry, matcher, inconsistencias),
    );

    // Cálculo do Fiscal (cadastrado → default por menor ANT da equipe rotativa do dia).
    const fiscal = equipe
      ? this.calcularFiscal(equipe, dataIso, tripulacao, efetivoTotal, inconsistencias)
      : null;

    // Marca o Fiscal nas linhas da tripulação.
    if (fiscal?.militarResolvido) {
      const fiscalNf = fiscal.militarResolvido.nf;
      for (const t of tripulacao) {
        if (t.militarResolvido?.nf === fiscalNf) t.isFiscal = true;
      }
    }

    // IDEO do dia, agrupado por tipo.
    const ideoEntries: PreviaIdeoEntry[] = [];
    for (const tipo of TIPO_IDEO) {
      const found = this.ideo.get(dia, tipo);
      if (!found) {
        inconsistencias.push({
          tipo: 'IDEO_NAO_CADASTRADO',
          mensagem: `IDEO ${tipo} não cadastrado para o dia ${dia}.`,
          detalhe: { dia, tipo },
        });
        continue;
      }
      ideoEntries.push({ tipo, itens: found.itens });
    }

    // Viaturas operacionais (status real vindo do Mapa Força).
    // Inclui também as viaturas baixadas/emprestadas (com status), para que o WhatsApp
    // possa mostrar `***#BAIXADA#***` inline ao invés de omitir a viatura.
    const allViaturas = await this.viaturas.list();
    const viaturasOp = allViaturas.map((v) => ({
      id: v.id,
      codigo: v.prefixo,
      descricao: v.funcaoOperacional ?? v.tipo,
      vtrStatus: v.status,
    }));

    // Detecta viaturas referenciadas pela composição mas não cadastradas.
    const viaturasReferidasNaEscala = new Set(
      tripulacao.map((t) => normalizeViaturaCode(t.viatura)).filter((s) => s.length > 0),
    );
    const viaturasConhecidas = new Set(viaturasOp.map((v) => normalizeViaturaCode(v.codigo)));
    for (const v of viaturasReferidasNaEscala) {
      if (!viaturasConhecidas.has(v)) {
        inconsistencias.push({
          tipo: 'VIATURA_DESCONHECIDA',
          mensagem: `A escala usa "${v}" que não está cadastrada como viatura operacional.`,
          detalhe: { viatura: v },
        });
      }
    }

    // F7a — Ajustes pré-turno (trocas/escala especial/NS/dispensas) persistidos por data.
    const ajustes = this.ajustes.get(dataIso);

    // S6a-fix item 4 — atos da Escala Especial do dia (read-only injetado).
    const atosEspeciais = this.escalasEspeciais.getAtosDoDia(ano, mes, dataIso).map((a) => ({
      data: a.data,
      militarRaw: a.militarRaw,
      horario: a.horario,
      funcao: a.funcao,
    }));

    // S6a-fix item 6 — Chefes de Operações escalados no dia (planilha externa).
    const chefes = await this.chefesOperacoes.getEscaladosDoDia(ano, mes, dia).catch(() => []);

    // S6b/F2 — composicaoMf espelhando o MF (1 entry por recurso)
    const composicaoMf = buildComposicaoMf(tripulacao, allViaturas);

    // S6b/F1 — Estado do Servico do dia
    const estadoServico = this.servico.get(dataIso);
    const alteracoesDiversas = this.servico.listAlteracoes(dataIso);

    return {
      data: dataIso,
      ano,
      mes,
      dia,
      equipe,
      equipeNome: equipe ? LETRA_EQUIPE_LABEL[equipe] : null,
      fiscal,
      composicaoMf,
      tripulacao,
      ideo: ideoEntries,
      viaturasOperacionais: viaturasOp,
      inconsistencias,
      trocas: ajustes.trocas,
      escalaEspecial: ajustes.escalaEspecial,
      notasServico: ajustes.notasServico,
      dispensas: ajustes.dispensas,
      escalaEspecialAtos: atosEspeciais,
      trocasEscalaEspecial: ajustes.trocasEscalaEspecial,
      chefesOperacoes: chefes,
      estadoServico: estadoServico.estado,
      iniciadoEm: estadoServico.iniciadoEm,
      iniciadoPorNf: estadoServico.iniciadoPorNf,
      encerradoEm: estadoServico.encerradoEm,
      encerradoPorNf: estadoServico.encerradoPorNf,
      alteracoesDiversas,
      origemEscala: escala?.origemArquivo ?? null,
      geradoEm: new Date().toISOString(),
    };
  }

  private buildTripulacaoEntry(
    entry: ComposicaoEntry,
    matcher: NomeMatcher,
    inconsistencias: PreviaInconsistencia[],
  ): PreviaTripulacaoEntry {
    const result = matcher.resolve(entry.militar);
    const resolved = result.resolved;
    if (!resolved) {
      inconsistencias.push({
        tipo: result.ambiguidade ? 'AMBIGUIDADE_NOME' : 'NF_NAO_RESOLVIDO',
        mensagem: result.ambiguidade
          ? `Ambiguidade ao resolver "${entry.militar.raw}" (${entry.equipe}/${entry.viatura}/${entry.funcao}) — múltiplos militares com este nome.`
          : `Não foi possível resolver NF de "${entry.militar.raw}" (${entry.equipe}/${entry.viatura}/${entry.funcao}).`,
        detalhe: {
          equipe: entry.equipe,
          viatura: entry.viatura,
          funcao: entry.funcao,
          raw: entry.militar.raw,
          postoAbreviado: entry.militar.postoAbreviado,
          nomeGuerra: entry.militar.nomeGuerra,
        },
      });
    }
    return {
      equipe: entry.equipe,
      viatura: entry.viatura,
      funcao: entry.funcao,
      militarRef: entry.militar,
      militarResolvido: resolved,
      isFiscal: false,
    };
  }

  private calcularFiscal(
    equipe: LetraEquipeRotativa,
    dataIso: string,
    tripulacao: PreviaTripulacaoEntry[],
    efetivoTotal: readonly Militar[],
    inconsistencias: PreviaInconsistencia[],
  ): PreviaFiscal | null {
    // Para cálculo do Fiscal, considera APENAS a equipe rotativa do dia (ignora AQUATICAS/STAFF).
    const escaladosResolvidos = tripulacao
      .filter((t) => t.equipe === equipe && t.militarResolvido)
      .map((t) => ({ nf: t.militarResolvido!.nf, ant: t.militarResolvido!.ant }));

    const cadastrado = this.fiscais.getCadastradoVigente(equipe, dataIso);
    if (cadastrado) {
      const resolvido = efetivoTotal.find((m) => m.nf === cadastrado.militarNf) ?? null;
      if (!resolvido) {
        inconsistencias.push({
          tipo: 'FISCAL_SEM_NF_RESOLVIDO',
          mensagem: `Fiscal cadastrado NF ${cadastrado.militarNf} não foi encontrado no efetivo da 1ª Cia.`,
          detalhe: { fiscalId: cadastrado.id, militarNf: cadastrado.militarNf },
        });
      }
      return {
        militarNf: cadastrado.militarNf,
        militarResolvido: resolvido,
        origem: 'cadastrado',
        fiscalId: cadastrado.id,
        motivo: cadastrado.motivo,
      };
    }

    if (escaladosResolvidos.length === 0) return null;

    const escolhido = [...escaladosResolvidos].sort((a, b) => a.ant - b.ant)[0]!;
    const resolvido = efetivoTotal.find((m) => m.nf === escolhido.nf) ?? null;
    return {
      militarNf: escolhido.nf,
      militarResolvido: resolvido,
      origem: 'default',
    };
  }
}

function parseDataIso(dataIso: string): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dataIso);
  if (!m) {
    throw new Error(`Data inválida: "${dataIso}". Esperado YYYY-MM-DD.`);
  }
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function normalizeViaturaCode(s: string): string {
  return s.trim().toUpperCase();
}

/**
 * Reagrupa `tripulacao` (1 entry por militar) em `composicaoMf` (1 entry por
 * recurso/viatura) — espelhando o shape do MF (S6b/F2/ADR-011).
 *
 * Cada entry tem chefe + motorista + operadores resolvidos.
 * Viaturas sem tripulação ainda aparecem no `composicaoMf` (com vtrStatus,
 * sem militares).
 */
function buildComposicaoMf(
  tripulacao: readonly PreviaTripulacaoEntry[],
  viaturas: readonly { id: string; prefixo: string; status: StatusViatura }[],
): ComposicaoMfEntry[] {
  const byRecurso = new Map<string, ComposicaoMfEntry>();

  for (const t of tripulacao) {
    const recurso = t.viatura;
    let entry = byRecurso.get(recurso);
    if (!entry) {
      const vtr = viaturas.find(
        (v) => normalizeViaturaCode(v.prefixo) === normalizeViaturaCode(recurso),
      );
      entry = {
        recurso,
        vtrPrefixo: vtr?.prefixo,
        vtrStatus: vtr?.status ?? null,
        semEquipe: false,
        equipe: t.equipe as LetraEquipe,
        chefe: undefined,
        motorista: undefined,
        operadores: [],
      };
      byRecurso.set(recurso, entry);
    }
    const militar: ComposicaoMfMilitar = {
      raw: t.militarRef.raw,
      postoAbreviado: t.militarRef.postoAbreviado,
      nomeGuerra: t.militarRef.nomeGuerra,
      militarResolvido: t.militarResolvido,
      statusConferencia: 'pendente',
      isFiscal: t.isFiscal,
    };
    if (t.funcao === 'Ch') entry.chefe = militar;
    else if (t.funcao === 'Mot') entry.motorista = militar;
    else entry.operadores.push(militar);
  }

  // Viaturas sem tripulação (orfãs) também entram para visibilidade do status.
  for (const v of viaturas) {
    if (!byRecurso.has(v.prefixo)) {
      byRecurso.set(v.prefixo, {
        recurso: v.prefixo,
        vtrPrefixo: v.prefixo,
        vtrStatus: v.status,
        semEquipe: true,
        equipe: null,
        chefe: undefined,
        motorista: undefined,
        operadores: [],
      });
    }
  }

  return Array.from(byRecurso.values());
}

/** Re-export para uso em tests/controller. */
export { TIPO_IDEO, type TipoIdeo };

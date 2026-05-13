import { Injectable } from '@nestjs/common';
import {
  gerarTextoFiscalAtestadoIdeo,
  LETRA_EQUIPE_LABEL,
  TIPO_IDEO,
  type ComposicaoEntry,
  type ComposicaoMfEntry,
  type ComposicaoMfMilitar,
  type LetraEquipe,
  type LetraEquipeRotativa,
  type Militar,
  type MilitarRef,
  type PreviaDoDia,
  type PreviaFiscal,
  type PreviaIdeoEntry,
  type PreviaInconsistencia,
  type PreviaTripulacaoEntry,
  type StatusViatura,
  type TipoIdeo,
} from '@argus/shared-types';
import {
  TIPO_DISPENSA_LABEL,
  type PreviaAtestado,
  type PreviaDispensa,
  type PreviaNotaServico,
} from '@argus/shared-types';
import { AtestadosService } from '../atestados/atestados.service';
import { ChefesOperacoesService } from '../chefes-operacoes/chefes-operacoes.service';
import { DispensasService } from '../dispensas/dispensas.service';
import { NotasServicoService } from '../notas-servico/notas-servico.service';
import { EfetivoService } from '../efetivo/efetivo.service';
import { EscalasService } from '../escalas/escalas.service';
import { EscalasEspeciaisService } from '../escalas-especiais/escalas-especiais.service';
import { FiscaisService } from '../fiscais/fiscais.service';
import { IdeoStatusService } from '../ideo/ideo-status.service';
import { IdeoService } from '../ideo/ideo.service';
import { ServicoService } from '../servico/servico.service';
import { TrocasAutorizadasService } from '../trocas-autorizadas/trocas-autorizadas.service';
import { ViaturasService } from '../viaturas/viaturas.service';
import { parseMilitarCell } from '../escalas/escala-xlsx-parser';
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
    private readonly ideoStatus: IdeoStatusService,
    private readonly dispensasSvc: DispensasService,
    private readonly atestadosSvc: AtestadosService,
    private readonly notasServicoSvc: NotasServicoService,
    private readonly trocasAutorizadas: TrocasAutorizadasService,
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

    // S0.3 — injeta MERGULHO 01/02 quando o XLSX importou seção de
    // mergulho (cadastro X16:AI20 + schedule R12/R13). Equipe rotativa
    // do dia é usada como flag por consistência com o resto do sistema.
    if (escala?.mergulho && equipe) {
      const mergulhoDoDia = escala.mergulho.porDia[dataIso];
      if (mergulhoDoDia) {
        if (mergulhoDoDia.mergulho01) {
          const eq = escala.mergulho.equipes[mergulhoDoDia.mergulho01];
          if (eq) {
            composicaoMf.push(
              buildComposicaoMfFromMergulho('MERGULHO 01', eq, equipe, allViaturas),
            );
          }
        }
        if (mergulhoDoDia.mergulho02) {
          const eq = escala.mergulho.equipes[mergulhoDoDia.mergulho02];
          if (eq) {
            composicaoMf.push(
              buildComposicaoMfFromMergulho('MERGULHO 02', eq, equipe, allViaturas),
            );
          }
        }
      }
    }

    // S0.4 — injeta SALVAMAR 01 quando o XLSX importou seção de salvamar
    // (cadastro X23:AE25 + schedule linha 14). Letra E/F do dia indica
    // qual equipe está de plantão.
    if (escala?.salvamar && equipe) {
      const letra = escala.salvamar.porDia[dataIso];
      if (letra) {
        const eq = escala.salvamar.equipes[letra];
        if (eq && eq.supervisores.length > 0) {
          composicaoMf.push(buildComposicaoMfFromSalvamar(eq, equipe, allViaturas, matcher));
        }
      }
    }

    // S6b/F1 — Estado do Servico do dia
    const estadoServico = this.servico.get(dataIso);
    const alteracoesDiversas = this.servico.listAlteracoes(dataIso);

    // S6j — Dispensas: deriva de DispensasService.listAtivasNoDia (entidade
    // canônica) + enriquece com nome do militar quando NF resolve no efetivo.
    const dispensasAtivas = this.dispensasSvc.listAtivasNoDia(dataIso);
    const efetivoByNf = new Map(efetivoTotal.map((m) => [m.nf, m]));
    const dispensasPrevia: PreviaDispensa[] = dispensasAtivas.map((d) => {
      const m = efetivoByNf.get(d.militarNf);
      return {
        militarRaw: m ? `${m.posto} ${m.nomeGuerra ?? m.nome.split(' ')[0]}` : `NF ${d.militarNf}`,
        militarNf: d.militarNf,
        tipo: d.tipo,
        tipoLabel: TIPO_DISPENSA_LABEL[d.tipo],
        dataInicio: d.dataInicio,
        dias: d.dias,
        numeroEdocs: d.numeroEdocs,
        dispensaId: d.id,
        motivo: d.observacoes,
      };
    });

    // S6l — Notas de Serviço do dia, enriquecidas com militares (nome formatado).
    const nsDoDia = this.notasServicoSvc.listDoDia(dataIso);
    const notasServicoEnriched: PreviaNotaServico[] = nsDoDia.map((n) => ({
      codigo: n.codigo,
      descricao: n.descricao,
      notaServicoId: n.id,
      horaInicio: n.horaInicio,
      horaFim: n.horaFim,
      viaturaPrefixo: n.viaturaPrefixo,
      militares: n.militaresNfs.map((nf) => {
        const m = efetivoByNf.get(nf);
        return {
          nf,
          raw: m ? `${m.posto} ${m.nomeGuerra ?? m.nome.split(' ')[0]}` : `NF ${nf}`,
        };
      }),
      observacoes: n.observacoes,
    }));

    // S6k — Atestados médicos ativos no dia (alterações de efetivo da PD).
    const atestadosAtivos = this.atestadosSvc.listAtivosNoDia(dataIso);
    const atestadosPrevia: PreviaAtestado[] = atestadosAtivos.map((a) => {
      const m = efetivoByNf.get(a.militarNf);
      return {
        atestadoId: a.id,
        militarNf: a.militarNf,
        militarRaw: m ? `${m.posto} ${m.nomeGuerra ?? m.nome.split(' ')[0]}` : `NF ${a.militarNf}`,
        dataInicio: a.dataInicio,
        dias: a.dias,
        cid10: a.cid10,
        crmMedico: a.crmMedico,
        observacoes: a.observacoes,
      };
    });

    // S6i — IDEO realizado/não-realizado + texto institucional do Fiscal
    const ideoStatus = this.ideoStatus.getByData(dataIso);
    const fiscalParaTexto = fiscal?.militarResolvido
      ? {
          posto: fiscal.militarResolvido.posto,
          nomeGuerra: fiscal.militarResolvido.nomeGuerra ?? fiscal.militarResolvido.nome,
          nf: fiscal.militarResolvido.nf,
        }
      : null;
    const textoAtestadoIdeoFiscal = gerarTextoFiscalAtestadoIdeo(ideoStatus, fiscalParaTexto);

    // S0.5/PR1 — Trocas Autorizadas (planilha externa) entram automaticamente
    // em `previa.trocas`. As trocas manuais (`ajustes.trocas`) vêm depois,
    // permitindo override pelo Fiscal.
    const trocasAutorizadasDoDia = await this.trocasAutorizadas.listByData(dataIso).catch((err) => {
      inconsistencias.push({
        tipo: 'TROCAS_AUTORIZADAS_INDISPONIVEIS',
        mensagem: `Não foi possível consultar a planilha de Trocas Autorizadas: ${(err as Error).message}`,
      });
      return [];
    });
    const trocasAutComoPrevia = trocasAutorizadasDoDia.map((t) =>
      converterTrocaAutorizadaEmPrevia(t, dataIso, matcher, inconsistencias),
    );
    const trocasFinalDoDia = [...trocasAutComoPrevia, ...ajustes.trocas];

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
      ideoStatus,
      textoAtestadoIdeoFiscal,
      viaturasOperacionais: viaturasOp,
      inconsistencias,
      trocas: trocasFinalDoDia,
      escalaEspecial: ajustes.escalaEspecial,
      notasServico: notasServicoEnriched,
      dispensas: dispensasPrevia,
      atestados: atestadosPrevia,
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

/**
 * S0.3 — Constrói uma entry de composicaoMf para MERGULHO 01/02 a partir
 * de uma EquipeMergulho (4 militares fixos do cadastro do XLSX). O recurso
 * é tagueado com a equipe rotativa do dia para consistência com o resto
 * do sistema (Prévia, conferências, PD).
 */
function buildComposicaoMfFromMergulho(
  recurso: 'MERGULHO 01' | 'MERGULHO 02',
  eq: {
    chefe: MilitarRef | null;
    motorista: MilitarRef | null;
    mergulhadores: readonly MilitarRef[];
  },
  equipeRotativa: LetraEquipeRotativa,
  viaturas: readonly { id: string; prefixo: string; status: StatusViatura }[],
): ComposicaoMfEntry {
  const vtr = viaturas.find(
    (v) => normalizeViaturaCode(v.prefixo) === normalizeViaturaCode(recurso),
  );
  const toMilitar = (m: MilitarRef): ComposicaoMfMilitar => ({
    raw: m.raw,
    postoAbreviado: m.postoAbreviado,
    nomeGuerra: m.nomeGuerra,
    militarResolvido: null, // resolução via NomeMatcher fica para próxima sprint
    statusConferencia: 'pendente',
    isFiscal: false,
  });
  return {
    recurso,
    vtrPrefixo: vtr?.prefixo,
    vtrStatus: vtr?.status ?? null,
    semEquipe: false,
    equipe: equipeRotativa as LetraEquipe,
    chefe: eq.chefe ? toMilitar(eq.chefe) : undefined,
    motorista: eq.motorista ? toMilitar(eq.motorista) : undefined,
    operadores: eq.mergulhadores.map(toMilitar),
  };
}

/**
 * S0.4 — Constrói uma entry de composicaoMf para SALVAMAR 01 a partir
 * de uma EquipeSalvamar (1-2 supervisores fixos do cadastro do XLSX).
 * supervisor[0] vira `chefe`, supervisor[1] (se houver) vira operador.
 * Resolve NF via NomeMatcher quando bate com o efetivo consolidado.
 */
function buildComposicaoMfFromSalvamar(
  eq: { supervisores: readonly MilitarRef[] },
  equipeRotativa: LetraEquipeRotativa,
  viaturas: readonly { id: string; prefixo: string; status: StatusViatura }[],
  matcher: NomeMatcher,
): ComposicaoMfEntry {
  const recurso = 'SALVAMAR 01' as const;
  const vtr = viaturas.find(
    (v) => normalizeViaturaCode(v.prefixo) === normalizeViaturaCode(recurso),
  );
  const toMilitar = (m: MilitarRef): ComposicaoMfMilitar => ({
    raw: m.raw,
    postoAbreviado: m.postoAbreviado,
    nomeGuerra: m.nomeGuerra,
    militarResolvido: matcher.resolve(m).resolved,
    statusConferencia: 'pendente',
    isFiscal: false,
  });
  const [chefe, ...operadores] = eq.supervisores;
  return {
    recurso,
    vtrPrefixo: vtr?.prefixo,
    vtrStatus: vtr?.status ?? null,
    semEquipe: false,
    equipe: equipeRotativa as LetraEquipe,
    chefe: chefe ? toMilitar(chefe) : undefined,
    motorista: undefined,
    operadores: operadores.map(toMilitar),
  };
}

/**
 * S0.5/PR1 — Converte uma `TrocaAutorizada` (planilha externa, 2 datas)
 * em uma `PreviaTroca` apropriada para a data alvo.
 *
 * Reconciliação militarRaw → NF: usa `parseMilitarCell()` para extrair
 * `{postoAbreviado, nomeGuerra}` da string raw ("SGT MARIANE") e
 * `NomeMatcher.resolve()` para descobrir a NF canônica. Quando não
 * resolve ou há ambiguidade, registra `NF_NAO_RESOLVIDO` ou
 * `AMBIGUIDADE_NOME` em `inconsistencias` com `detalhe.origem =
 * 'trocas-autorizadas'` — Fiscal vê na UI da Prévia.
 */
function converterTrocaAutorizadaEmPrevia(
  troca: {
    dataEscala: string;
    dataPagamento: string;
    escaladoOriginal: string;
    substituto: string;
    escaladoPagamento: string;
    substitutoPagamento: string;
    funcao: string;
    funcaoPagamento: string;
    horario: string;
    horarioPagamento: string;
    numeroEdocs?: string;
  },
  dataIso: string,
  matcher: NomeMatcher,
  inconsistencias: PreviaInconsistencia[],
): {
  substituidoRaw: string;
  substituidoNf?: string;
  substitutoRaw: string;
  substitutoNf?: string;
  periodo: string;
  funcao?: string;
  numeroEdocs?: string;
  origemAutorizada: boolean;
} {
  const isLadoEscala = troca.dataEscala === dataIso;
  const escaladoRaw = isLadoEscala ? troca.escaladoOriginal : troca.escaladoPagamento;
  const substitutoRaw = isLadoEscala ? troca.substituto : troca.substitutoPagamento;
  const funcao = isLadoEscala ? troca.funcao : troca.funcaoPagamento;
  const horario = isLadoEscala ? troca.horario : troca.horarioPagamento;

  const substituidoNf = resolverNfTrocaAutorizada(escaladoRaw, 'escalado', matcher, inconsistencias);
  const substitutoNf = resolverNfTrocaAutorizada(
    substitutoRaw,
    'substituto',
    matcher,
    inconsistencias,
  );

  return {
    substituidoRaw: escaladoRaw,
    substituidoNf,
    substitutoRaw,
    substitutoNf,
    periodo: horario || 'horário não informado',
    funcao: funcao || undefined,
    numeroEdocs: troca.numeroEdocs,
    origemAutorizada: true,
  };
}

/**
 * Resolve nome bruto (ex.: "SGT MARIANE") em NF canônica via parser +
 * matcher. Retorna `undefined` quando não resolve e registra
 * inconsistência apropriada — caller monta o `PreviaTroca` mesmo sem
 * NF (raw continua válido para a UI).
 */
function resolverNfTrocaAutorizada(
  raw: string,
  papel: 'escalado' | 'substituto',
  matcher: NomeMatcher,
  inconsistencias: PreviaInconsistencia[],
): string | undefined {
  const ref = parseMilitarCell(raw);
  if (!ref) return undefined;
  const { resolved, ambiguidade } = matcher.resolve(ref);
  if (resolved) return resolved.nf;
  inconsistencias.push({
    tipo: ambiguidade ? 'AMBIGUIDADE_NOME' : 'NF_NAO_RESOLVIDO',
    mensagem: ambiguidade
      ? `Trocas Autorizadas: ambiguidade ao resolver ${papel} "${raw}" — múltiplos militares.`
      : `Trocas Autorizadas: não foi possível resolver NF de ${papel} "${raw}".`,
    detalhe: {
      origem: 'trocas-autorizadas',
      papel,
      raw,
      postoAbreviado: ref.postoAbreviado,
      nomeGuerra: ref.nomeGuerra,
    },
  });
  return undefined;
}

/** Re-export para uso em tests/controller. */
export { TIPO_IDEO, type TipoIdeo };

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
  type AtivacaoRecurso,
  type MilitarRef,
  type MapaForcaDoDia,
  type FiscalDoDia,
  type PreviaIdeoEntry,
  type MapaForcaInconsistencia,
  type ParRecurso,
  type PreviaSwapMilitar,
  type TripulacaoEntry,
  type StatusViatura,
  type StatusVtr,
  type TipoIdeo,
} from '@argus/shared-types';
import {
  TIPO_DISPENSA_LABEL,
  type PreviaAtestado,
  type PreviaDispensa,
  type PreviaFerias,
  type PreviaNotaServico,
  type StatusAprovacao,
} from '@argus/shared-types';
import { AjustesPreviaService, trocaApprovalId } from './ajustes-previa.service';
import { AtestadosService } from '../atestados/atestados.service';
import { FeriasService } from '../ferias/ferias.service';
import { ChefesOperacoesService } from '../chefes-operacoes/chefes-operacoes.service';
import { DispensasService } from '../dispensas/dispensas.service';
import { NotasServicoService } from '../notas-servico/notas-servico.service';
import { EfetivoService } from '../efetivo/efetivo.service';
import { EscalasService } from '../escalas/escalas.service';
import { EscalasEspeciaisService } from '../escalas-especiais/escalas-especiais.service';
import { FiscaisService } from '../fiscais/fiscais.service';
import { IdeoStatusService } from '../ideo/ideo-status.service';
import { IdeoService } from '../ideo/ideo.service';
import { MapaForcaCiodesService } from '../mapa-forca-ciodes/mapa-forca-ciodes.service';
import { ServicoService } from '../servico/servico.service';
import { forwardRef, Inject } from '@nestjs/common';
import { TrocasAutorizadasService } from '../trocas-autorizadas/trocas-autorizadas.service';
import { ViaturasService } from '../viaturas/viaturas.service';
import { parseMilitarCell } from '../escalas/escala-xlsx-parser';
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
export class MapaForcaService {
  constructor(
    private readonly escalas: EscalasService,
    private readonly efetivo: EfetivoService,
    private readonly fiscais: FiscaisService,
    private readonly ideo: IdeoService,
    private readonly viaturas: ViaturasService,
    private readonly ajustes: AjustesPreviaService,
    private readonly escalasEspeciais: EscalasEspeciaisService,
    private readonly chefesOperacoes: ChefesOperacoesService,
    @Inject(forwardRef(() => ServicoService))
    private readonly servico: ServicoService,
    private readonly ideoStatus: IdeoStatusService,
    private readonly dispensasSvc: DispensasService,
    private readonly atestadosSvc: AtestadosService,
    private readonly notasServicoSvc: NotasServicoService,
    private readonly trocasAutorizadas: TrocasAutorizadasService,
    private readonly feriasSvc: FeriasService,
    private readonly mapaForcaCiodes: MapaForcaCiodesService,
  ) {}

  async getMapaForcaDoDia(dataIso: string): Promise<MapaForcaDoDia> {
    const [ano, mes, dia] = parseDataIso(dataIso);
    const inconsistencias: MapaForcaInconsistencia[] = [];

    const escala = await this.escalas.get(ano, mes);
    if (!escala) {
      inconsistencias.push({
        tipo: 'SEM_ESCALA_NO_MES',
        mensagem: `Não há escala importada para ${String(mes).padStart(2, '0')}/${ano}. Importe o XLSX em /cadastros/escalas.`,
      });
    }

    const escalados = await this.escalas.getEscaladosDoDia(ano, mes, dataIso);
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
    // S2.10.7c — efetivoByNf usado tanto para enriquecer dispensas/atestados
    // quanto para aplicar trocas aprovadas em tripulação antes do build.
    const efetivoByNf = new Map(efetivoTotal.map((m) => [m.nf, m]));

    // S6g (2026-05-10) — Tripulação vem 100% da Escala XLSX da SOS. O complemento
    // via MF (`buildComplementosFromMapaForca`) foi removido: militares do MF
    // (chefe/motorista/operadores das colunas D-J) NÃO entram mais na Prévia.
    // Do MF continuam vindo apenas: status das viaturas (vtrStatus) e a whitelist
    // de Recursos válidos. Sem XLSX importado, `tripulacao` fica vazia.
    const tripulacao: TripulacaoEntry[] = escalados.entries.map((entry) =>
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
    const mfRecursos = await this.mapaForcaCiodes.getRecursos();
    const viaturasOp = allViaturas.map((v) => ({
      id: v.id,
      codigo: v.prefixo,
      descricao: v.funcaoOperacional ?? v.tipo,
      vtrStatus: v.status,
    }));

    // S0.x/dev-fixes — Detecta viaturas REALMENTE desconhecidas. A escala
    // XLSX coloca o nome do recurso na coluna "viatura" (ex.: "ABTS_01",
    // "RESGATE 01"), não o prefixo. O aviso só é emitido quando o valor
    // referenciado não bate com nenhum prefixo de viatura cadastrada NEM
    // com nenhum nome de recurso conhecido do MF CIODES — caso contrário
    // é apenas o nome do recurso e a info já vem correta.
    const viaturasReferidasNaEscala = new Set(
      tripulacao.map((t) => normalizeViaturaCode(t.viatura)).filter((s) => s.length > 0),
    );
    const viaturasConhecidas = new Set(viaturasOp.map((v) => normalizeViaturaCode(v.codigo)));
    const recursosConhecidos = new Set(mfRecursos.map((r) => normalizeViaturaCode(r.recurso)));
    for (const v of viaturasReferidasNaEscala) {
      if (viaturasConhecidas.has(v)) continue;
      if (recursosConhecidos.has(v)) continue; // é nome de recurso, não de viatura — ok
      inconsistencias.push({
        tipo: 'VIATURA_DESCONHECIDA',
        mensagem: `A escala usa "${v}" que não está cadastrada como viatura operacional.`,
        detalhe: { viatura: v },
      });
    }

    // F7a — Ajustes pré-turno (trocas/escala especial/NS/dispensas) persistidos por data.
    const ajustes = this.ajustes.get(dataIso);
    // S2.10.7b/c — Decisões de aprovação individual do Fiscal por item.
    // Persistido em Prisma desde S2.10.7c.
    const aprovacoes = await this.ajustes.getAprovacoes(dataIso);
    const statusAprovacaoDispensa = (id: string): StatusAprovacao =>
      aprovacoes.get(`dispensa:${id}`) ?? 'pendente';
    const statusAprovacaoAtestado = (id: string): StatusAprovacao =>
      aprovacoes.get(`atestado:${id}`) ?? 'pendente';
    const statusAprovacaoTroca = (trocaIdStr: string): StatusAprovacao =>
      aprovacoes.get(`troca:${trocaIdStr}`) ?? 'pendente';

    // S6a-fix item 4 — atos da Escala Especial do dia (read-only injetado).
    const atosEspeciais = (await this.escalasEspeciais.getAtosDoDia(ano, mes, dataIso)).map(
      (a) => ({
        data: a.data,
        militarRaw: a.militarRaw,
        horario: a.horario,
        funcao: a.funcao,
      }),
    );

    // S6a-fix item 6 — Chefes de Operações escalados no dia (planilha externa).
    const chefes = await this.chefesOperacoes.getEscaladosDoDia(ano, mes, dia).catch(() => []);

    // S0.x/Fix-2 — Injeta o Chefe Titular (vindo da planilha de ChOp) como
    // entry em `tripulacao` para que apareça no MESMO card "CHEFE DE OPERAÇÕES"
    // do motorista do XLSX (linha 16). Só 1 Chefe por dia (decisão Tech Lead
    // 2026-05-13); trocas seguem fluxo padrão de trocas autorizadas.
    //
    // S0.x/fixes-3 — Aplica `ajustes.overridesChefeOperacoes` ANTES de
    // injetar: se há override para este dia, substitui o chefe escalado
    // pelo militar do override (deve estar habilitado na planilha ChOp).
    let chefeTitular = chefes[0];
    const overrideChop = ajustes.overridesChefeOperacoes.find((o) => o.data === dataIso);
    if (overrideChop) {
      const habilitados = await this.chefesOperacoes.getHabilitadosNfs();
      if (!habilitados.has(overrideChop.novoChefeNf)) {
        inconsistencias.push({
          tipo: 'NF_NAO_RESOLVIDO',
          mensagem: `Override de Chefe de Operações: NF ${overrideChop.novoChefeNf} não está habilitado na planilha ChOp.`,
          detalhe: { origem: 'override-chop', novoChefeNf: overrideChop.novoChefeNf },
        });
      } else {
        const novoMilitar = efetivoTotal.find((m) => m.nf === overrideChop.novoChefeNf);
        if (novoMilitar) {
          chefeTitular = {
            posto: novoMilitar.posto,
            nomeGuerra:
              novoMilitar.nomeGuerra ?? novoMilitar.nome.split(' ')[0] ?? novoMilitar.nome,
            nf: novoMilitar.nf,
          };
        }
      }
    }
    if (chefeTitular) {
      const ref: MilitarRef = {
        raw: `${chefeTitular.posto} ${chefeTitular.nomeGuerra}`.trim(),
        postoAbreviado: chefeTitular.posto.replace(/\s+/g, '').toUpperCase(),
        nomeGuerra: chefeTitular.nomeGuerra,
      };
      const resolvido = efetivoTotal.find((m) => m.nf === chefeTitular.nf) ?? null;
      tripulacao.push({
        equipe: 'STAFF',
        viatura: 'CHEFE DE OPERAÇÕES',
        funcao: 'Ch',
        militarRef: ref,
        militarResolvido: resolvido,
        isFiscal: false,
      });
    }

    // S0.x/Fix-1 — Injeta entries de MERGULHO 01/02 e SALVAMAR 01 em
    // `tripulacao` ANTES de buildComposicaoMf. Antes os recursos só
    // entravam em composicaoMf via buildComposicaoMfFromMergulho/Salvamar,
    // mas o frontend renderiza `tripulacao` — então sumiam visualmente.
    // Empurrar para tripulacao faz com que buildComposicaoMf gere a
    // entry automaticamente e que /previa exiba os cards.
    if (escala?.mergulho && equipe) {
      const mergulhoDoDia = escala.mergulho.porDia[dataIso];
      if (mergulhoDoDia) {
        // S0.x/Fix-Mergulho — Override do Fiscal pode trocar M01↔M02.
        const swap = ajustes.overridesMergulho.some((o) => o.data === dataIso && o.swap);
        const letraM01 = swap ? mergulhoDoDia.mergulho02 : mergulhoDoDia.mergulho01;
        const letraM02 = swap ? mergulhoDoDia.mergulho01 : mergulhoDoDia.mergulho02;
        // Cadastro do Mergulho é independente por quinzena (Sargenteante monta uma
        // matriz por aba): resolve pelo dia consultado.
        const diaNum = Number.parseInt(dataIso.slice(8, 10), 10);
        const equipesMergulho =
          diaNum <= escala.mergulho.equipesPorQuinzena.ultimoDiaQ1
            ? escala.mergulho.equipesPorQuinzena.q1
            : escala.mergulho.equipesPorQuinzena.q2;
        if (letraM01) {
          const eq = equipesMergulho[letraM01];
          if (eq) injetarMergulhoEmTripulacao('MERGULHO 01', eq, equipe, tripulacao, matcher);
        }
        if (letraM02) {
          const eq = equipesMergulho[letraM02];
          if (eq) injetarMergulhoEmTripulacao('MERGULHO 02', eq, equipe, tripulacao, matcher);
        }
      }
    }

    if (escala?.salvamar && equipe) {
      const letra = escala.salvamar.porDia[dataIso];
      if (letra) {
        const diaNum = Number.parseInt(dataIso.slice(8, 10), 10);
        const equipesSalvamar =
          diaNum <= escala.salvamar.equipesPorQuinzena.ultimoDiaQ1
            ? escala.salvamar.equipesPorQuinzena.q1
            : escala.salvamar.equipesPorQuinzena.q2;
        const eq = equipesSalvamar[letra];
        if (eq && eq.supervisores.length > 0) {
          injetarSalvamarEmTripulacao(eq, equipe, tripulacao, matcher);
        }
      }
    }

    // S0.x/Fix-AtivarRecurso — Fiscal pode ativar recursos do MF que não
    // estão na escala XLSX do dia. Cada ativação vira entries em
    // tripulacao (chefe + motorista? + operadores?), com a viatura
    // atribuída e equipe rotativa do dia (default).
    for (const ativ of ajustes.ativacoesRecurso) {
      if (ativ.data === dataIso) {
        injetarAtivacaoRecurso(ativ, equipe, tripulacao, matcher, inconsistencias);
      }
    }

    // S0.5 — Aplica swaps de militares entre 2 posições da mesma equipe
    // (UX do Fiscal). Mutação de `tripulacao` ANTES de buildComposicaoMf
    // para que ambas as visões fiquem consistentes. Swaps inválidos
    // (célula não encontrada ou equipes diferentes) viram inconsistência.
    for (const swap of ajustes.swapsMilitares) {
      aplicarSwapMilitar(swap, tripulacao, inconsistencias);
    }

    // Override de pares 01↔02 (Logística): quando a viatura nominal de um
    // recurso está indisponível no MF e o par tem viatura, o Fiscal pode
    // realocar a tripulação. Aplicado ANTES de buildComposicaoMf para que
    // o card no front e o WhatsApp reflitam o destino real.
    for (const o of ajustes.overridesParesRecursos.filter((x) => x.data === dataIso)) {
      aplicarOverrideParRecurso(o.par, tripulacao);
    }

    // S0.5/PR1 — Trocas Autorizadas (planilha externa) entram automaticamente
    // em `previa.trocas`. As trocas manuais (`ajustes.trocas`) vêm depois,
    // permitindo override pelo Fiscal.
    // S2.10.7c — movido para ANTES de buildComposicaoMf: as trocas APROVADAS
    // são aplicadas em tripulação primeiro, para que composicaoMf reflita o
    // efetivo real (swap pós-aprovação).
    const trocasAutorizadasDoDia = await this.trocasAutorizadas.listByData(dataIso).catch((err) => {
      inconsistencias.push({
        tipo: 'TROCAS_AUTORIZADAS_INDISPONIVEIS',
        mensagem: `Não foi possível consultar a planilha de Trocas Autorizadas: ${(err as Error).message}`,
      });
      return [];
    });
    // S0.5/0.1.1.3 — para validar substituto de ChOp contra a planilha
    // específica, carregamos a lista de NFs habilitados (1 vez por
    // request). Vazio se a planilha não está sincronizada.
    const chopHabilitados = await this.chefesOperacoes.getHabilitadosNfs();
    const trocasAutComoPrevia = dedupTrocasAutorizadas(
      trocasAutorizadasDoDia.map((t) =>
        converterTrocaAutorizadaEmPrevia(t, dataIso, matcher, inconsistencias, chopHabilitados),
      ),
    ).map((t) => {
      // S2.10.7b — Identificador estável + status de aprovação por troca.
      const id = trocaApprovalId(t);
      return {
        ...t,
        trocaId: id,
        statusAprovacao: statusAprovacaoTroca(id),
      };
    });
    // Trocas manuais do Fiscal entram já como aprovadas (foi o próprio Fiscal).
    const trocasManuaisAprovadas = ajustes.trocas.map((t) => ({
      ...t,
      statusAprovacao: t.statusAprovacao ?? ('aprovada' as StatusAprovacao),
    }));
    const trocasFinalDoDia = [...trocasAutComoPrevia, ...trocasManuaisAprovadas];

    // S2.10.7c — Aplica trocas APROVADAS em tripulação para que composicaoMf
    // reflita o efetivo real do recurso. Trocas pendentes/rejeitadas não
    // alteram a composição.
    let tripulacaoComTrocas = tripulacao;
    for (const troca of trocasFinalDoDia) {
      if (troca.statusAprovacao !== 'aprovada') continue;
      tripulacaoComTrocas = aplicarTrocaAprovadaEmTripulacao(
        tripulacaoComTrocas,
        troca,
        efetivoByNf,
        inconsistencias,
      );
    }

    // S6b/F2 — composicaoMf espelhando o MF (1 entry por recurso).
    // Já inclui MERGULHO 01/02 e SALVAMAR 01 porque foram empurrados em
    // tripulacao acima.
    // S0.x — Inclui em composicaoMf TODOS os recursos do MF CIODES com
    // viatura cadastrada (mesmo BAIXADA/EMPRESTADA), para garantir que
    // recursos como RESGATE 02 (AR_044 BAIXADA) e PLATAFORMA (TE_110
    // BAIXADA) constem na Prévia, no preenchimento do MF e na Parte
    // Diária mesmo sem militares no XLSX.
    const composicaoMf = buildComposicaoMf(tripulacaoComTrocas, allViaturas, mfRecursos);

    // S6b/F1 — Estado do Servico do dia
    const estadoServico = this.servico.get(dataIso);
    const alteracoesDiversas = this.servico.listAlteracoes(dataIso);

    // S6j — Dispensas: deriva de DispensasService.listAtivasNoDia (entidade
    // canônica) + enriquece com nome do militar quando NF resolve no efetivo.
    // S2.10.7d — agora async (Prisma).
    const dispensasAtivas = await this.dispensasSvc.listAtivasNoDia(dataIso);
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
        statusAprovacao: statusAprovacaoDispensa(d.id),
      };
    });

    // S0.5/4.1 — Férias ativas no dia (mesmo padrão das dispensas).
    const feriasAtivas = this.feriasSvc.listAtivasNoDia(dataIso);
    const feriasPrevia: PreviaFerias[] = feriasAtivas.map((f) => {
      const m = efetivoByNf.get(f.militarNf);
      return {
        feriasId: f.id,
        militarNf: f.militarNf,
        militarRaw: m ? `${m.posto} ${m.nomeGuerra ?? m.nome.split(' ')[0]}` : `NF ${f.militarNf}`,
        mesAno: f.mesAno,
        dataInicio: f.dataInicio,
        dias: f.dias,
        observacoes: f.observacoes,
      };
    });

    // S6l — Notas de Serviço do dia, enriquecidas com militares (nome formatado).
    const nsDoDia = await this.notasServicoSvc.listDoDia(dataIso);
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
        statusAprovacao: statusAprovacaoAtestado(a.id),
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

    return {
      data: dataIso,
      ano,
      mes,
      dia,
      equipe,
      equipeNome: equipe ? LETRA_EQUIPE_LABEL[equipe] : null,
      fiscal,
      composicaoMf,
      // S2.10.7c — tripulação refletindo as trocas aprovadas (swap pós-aprovação).
      tripulacao: tripulacaoComTrocas,
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
      ferias: feriasPrevia,
      escalaEspecialAtos: atosEspeciais,
      trocasEscalaEspecial: ajustes.trocasEscalaEspecial,
      empenhosEscalaEspecial: ajustes.empenhosEscalaEspecial ?? [],
      swapsMilitares: ajustes.swapsMilitares,
      overridesMergulho: ajustes.overridesMergulho,
      overridesParesRecursos: ajustes.overridesParesRecursos,
      ativacoesRecurso: ajustes.ativacoesRecurso,
      overridesChefeOperacoes: ajustes.overridesChefeOperacoes,
      composicaoAtualMf: mfRecursos
        .filter((r) => r.chefe || r.motorista || r.operadores.length > 0)
        .map((r) => ({
          recurso: r.recurso,
          chefe: r.chefe,
          motorista: r.motorista,
          operadores: r.operadores,
        })),
      chefesOperacoes: chefes,
      estadoServico: estadoServico.estado,
      previaIniciadaEm: estadoServico.previaIniciadaEm,
      previaIniciadaPorNf: estadoServico.previaIniciadaPorNf,
      iniciadoEm: estadoServico.iniciadoEm,
      iniciadoPorNf: estadoServico.iniciadoPorNf,
      mfPreenchidoEm: estadoServico.mfPreenchidoEm,
      mfDirtyDesde: estadoServico.mfDirtyDesde,
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
    inconsistencias: MapaForcaInconsistencia[],
  ): TripulacaoEntry {
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

  /**
   * S0.x/rename-mapa-forca — Retorna o Fiscal escalado do dia sem carregar
   * o payload completo do Mapa Força. Usado pelo controller `getFiscalDoDia`
   * e pelo `ServicoService.iniciarPrevia` (permission gate).
   *
   * Em ambiente mock the full pipeline tem custo baixo; em S5b (Supabase)
   * podemos otimizar com queries direcionadas.
   */
  async getFiscalDoDia(dataIso: string): Promise<FiscalDoDia | null> {
    const payload = await this.getMapaForcaDoDia(dataIso);
    return payload.fiscal;
  }

  /**
   * S0.x — Lista os recursos onde o usuário identificado é Chefe (`composicaoMf`).
   * Usado pelo gating granular das Conferências e da IDEO. Retorna nomes
   * canônicos dos recursos (ex.: "ABTS_01", "RESGATE 01").
   */
  async recursosComandadosPor(nf: string, dataIso: string): Promise<string[]> {
    const payload = await this.getMapaForcaDoDia(dataIso);
    return payload.composicaoMf
      .filter((c) => c.chefe?.militarResolvido?.nf === nf)
      .map((c) => c.recurso);
  }

  /**
   * S0.x — Recursos onde o usuário é Motorista (analogia para gating de
   * Conferência de Viatura). Inclui também recursos onde é Chefe (chefe pode
   * fazer conferência da viatura vinculada).
   */
  async recursosOndeMotoristaOuChefe(nf: string, dataIso: string): Promise<string[]> {
    const payload = await this.getMapaForcaDoDia(dataIso);
    return payload.composicaoMf
      .filter(
        (c) => c.chefe?.militarResolvido?.nf === nf || c.motorista?.militarResolvido?.nf === nf,
      )
      .map((c) => c.recurso);
  }

  private calcularFiscal(
    equipe: LetraEquipeRotativa,
    dataIso: string,
    tripulacao: TripulacaoEntry[],
    efetivoTotal: readonly Militar[],
    inconsistencias: MapaForcaInconsistencia[],
  ): FiscalDoDia | null {
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
 * Cada entry tem chefe + motorista + operadores resolvidos. Recursos
 * cadastrados no MF CIODES com viatura mas sem tripulação no XLSX entram
 * com `semEquipe: true` (ex.: RESGATE 02 = AR_044 BAIXADA) — visíveis na
 * Prévia, no preenchimento do MF CIODES e na Parte Diária.
 */
function buildComposicaoMf(
  tripulacao: readonly TripulacaoEntry[],
  viaturas: readonly { id: string; prefixo: string; status: StatusViatura }[],
  mfRecursos: readonly { recurso: string; vtrPrefixo?: string; vtrStatus: StatusVtr | null }[],
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
        efetivoPrevistoNaoPreenchido: [],
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
    // S2.10.7 Parte B — VTR BAIXADA/EMPRESTADA: NÃO preenche efetivo no
    // recurso. O escalado fica na lista `efetivoPrevistoNaoPreenchido`
    // para o Fiscal decidir individualmente (usar/não usar/alterar VTR).
    const vtrStatus = entry.vtrStatus;
    if (vtrStatus === 'BAIXADA' || vtrStatus === 'EMPRESTADA') {
      entry.efetivoPrevistoNaoPreenchido.push({ funcao: t.funcao, militar });
      entry.semEquipe = true;
      continue;
    }
    if (t.funcao === 'Ch') entry.chefe = militar;
    else if (t.funcao === 'Mot') entry.motorista = militar;
    else entry.operadores.push(militar);
  }

  // S0.x — Recursos do MF CIODES com viatura mas sem tripulação no XLSX.
  // Mantém o NOME canônico do recurso (ex.: "RESGATE 02") em vez do prefixo
  // da viatura (ex.: "AR_044"). Isso permite que recursos baixados constem
  // no preenchimento do MF e na Parte Diária.
  for (const r of mfRecursos) {
    if (!r.vtrPrefixo) continue; // ex.: GUARDA, OFICIAL DE DIA — sem viatura
    if (byRecurso.has(r.recurso)) continue; // já tem tripulação no XLSX
    const vtr = viaturas.find(
      (v) => normalizeViaturaCode(v.prefixo) === normalizeViaturaCode(r.vtrPrefixo!),
    );
    const status = mapStatusVtrToViatura(r.vtrStatus);
    byRecurso.set(r.recurso, {
      recurso: r.recurso,
      vtrPrefixo: r.vtrPrefixo,
      vtrStatus: vtr?.status ?? status,
      semEquipe: true,
      equipe: null,
      chefe: undefined,
      motorista: undefined,
      operadores: [],
      efetivoPrevistoNaoPreenchido: [],
    });
  }

  // S2.10.7c — Viaturas SEM vinculação a nenhum recurso do MF CIODES NÃO
  // entram mais em composicaoMf. Elas aparecem apenas no bloco standalone
  // "Viaturas (status do MF)" no frontend, via filtro dinâmico baseado em
  // composicaoMf.vtrPrefixo. Isso elimina os cards "soltos" (ABTS_011,
  // AC_001, …) que apareciam na Tripulação depois do último recurso real.
  return Array.from(byRecurso.values());
}

/** Converte StatusVtr (MF CIODES) → StatusViatura (modelo interno). */
function mapStatusVtrToViatura(s: StatusVtr | null): StatusViatura | null {
  if (s === null || s === 'NAO_POSSUI') return null;
  return s as StatusViatura;
}

/**
 * S0.x/Fix-1 — Empurra os militares de uma equipe de MERGULHO (cadastro
 * do XLSX) para `tripulacao` como `TripulacaoEntry`. O recurso
 * (MERGULHO 01 ou 02) vira o campo `viatura`. Equipe é tagueada com a
 * rotativa do dia para consistência com Conferências/PD.
 *
 * Substitui o antigo `buildComposicaoMfFromMergulho` — agora composicaoMf
 * é derivado de tripulacao via `buildComposicaoMf` (1 caminho só, evita
 * divergência entre as duas visões).
 */
function injetarMergulhoEmTripulacao(
  recurso: 'MERGULHO 01' | 'MERGULHO 02',
  eq: {
    chefe: MilitarRef | null;
    motorista: MilitarRef | null;
    mergulhadores: readonly MilitarRef[];
  },
  equipeRotativa: LetraEquipeRotativa,
  tripulacao: TripulacaoEntry[],
  matcher: NomeMatcher,
): void {
  const push = (ref: MilitarRef, funcao: string): void => {
    tripulacao.push({
      equipe: equipeRotativa as LetraEquipe,
      viatura: recurso,
      funcao,
      militarRef: ref,
      militarResolvido: matcher.resolve(ref).resolved,
      isFiscal: false,
    });
  };
  if (eq.chefe) push(eq.chefe, 'Ch');
  if (eq.motorista) push(eq.motorista, 'Mot');
  eq.mergulhadores.forEach((m, i) => push(m, `Merg${i + 1}`));
}

/**
 * S0.x/Fix-1 — Empurra o(s) supervisor(es) de SALVAMAR 01 para
 * `tripulacao`. supervisor[0] vira funcao=Ch (com 1 militar a PD
 * já exibe "Chefe/Motorista" via `mapEscalaOperacional`, conforme
 * PR #21). supervisor[1] (raríssimo) vira funcao=Op.
 */
function injetarSalvamarEmTripulacao(
  eq: { supervisores: readonly MilitarRef[] },
  equipeRotativa: LetraEquipeRotativa,
  tripulacao: TripulacaoEntry[],
  matcher: NomeMatcher,
): void {
  const [chefe, ...operadores] = eq.supervisores;
  const push = (ref: MilitarRef, funcao: string): void => {
    tripulacao.push({
      equipe: equipeRotativa as LetraEquipe,
      viatura: 'SALVAMAR 01',
      funcao,
      militarRef: ref,
      militarResolvido: matcher.resolve(ref).resolved,
      isFiscal: false,
    });
  };
  if (chefe) push(chefe, 'Ch');
  operadores.forEach((m, i) => push(m, `Op${i + 1}`));
}

/**
 * S0.x/Fix-AtivarRecurso — Empurra entries em `tripulacao` para um recurso
 * ativado ad-hoc pelo Fiscal. Detecta conflito quando o recurso já está
 * presente em `tripulacao` (evita duplicação) — registra inconsistência
 * e ignora a ativação.
 */
function injetarAtivacaoRecurso(
  ativ: AtivacaoRecurso,
  equipeDoDia: LetraEquipeRotativa | null,
  tripulacao: TripulacaoEntry[],
  matcher: NomeMatcher,
  inconsistencias: MapaForcaInconsistencia[],
): void {
  const jaPresente = tripulacao.some((t) => t.viatura === ativ.recurso);
  if (jaPresente) {
    inconsistencias.push({
      tipo: 'NF_NAO_RESOLVIDO',
      mensagem: `Ativação ignorada: recurso "${ativ.recurso}" já está presente na tripulação do dia ${ativ.data}.`,
      detalhe: { origem: 'ativacao-recurso', recurso: ativ.recurso, data: ativ.data },
    });
    return;
  }
  const equipe = (ativ.equipe ?? equipeDoDia ?? 'STAFF') as LetraEquipe;
  const push = (ref: MilitarRef, funcao: string): void => {
    tripulacao.push({
      equipe,
      viatura: ativ.recurso,
      funcao,
      militarRef: ref,
      militarResolvido: matcher.resolve(ref).resolved,
      isFiscal: false,
    });
  };
  push(ativ.chefe, 'Ch');
  if (ativ.motorista) push(ativ.motorista, 'Mot');
  ativ.operadores.forEach((m, i) => push(m, `Op${i + 1}`));
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
/**
 * S0.x/dev-fixes — Dedup de trocas autorizadas por
 * `substitutoNf|periodo` (fallback `substitutoRaw|periodo`). A planilha
 * frequentemente contém 2 linhas para a mesma troca: uma incompleta
 * (sem NF do substituído) e outra completa. Mantém a entry mais
 * completa — a que tem `substituidoNf` preenchido.
 */
function dedupTrocasAutorizadas<
  T extends {
    substituidoNf?: string;
    substitutoNf?: string;
    substitutoRaw: string;
    periodo: string;
  },
>(trocas: T[]): T[] {
  const byKey = new Map<string, T>();
  for (const t of trocas) {
    const chaveSubstituto = t.substitutoNf ?? t.substitutoRaw.trim().toLowerCase();
    const key = `${chaveSubstituto}|${t.periodo}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, t);
      continue;
    }
    // Preserva a entry mais completa: a que tem substituidoNf preenchido.
    const novaTemNf = !!t.substituidoNf;
    const existingTemNf = !!existing.substituidoNf;
    if (novaTemNf && !existingTemNf) byKey.set(key, t);
  }
  return Array.from(byKey.values());
}

function converterTrocaAutorizadaEmPrevia(
  troca: {
    dataEscala: string;
    dataPagamento: string;
    escaladoOriginal: string;
    /** S2.8.3 — NF direto vindo da planilha (col G). Quando presente,
     *  elimina ambiguidade do NomeMatcher. */
    escaladoOriginalNf?: string;
    substituto: string;
    /** S2.8.3 — NF direto vindo da planilha (col K). */
    substitutoNf?: string;
    escaladoPagamento: string;
    substitutoPagamento: string;
    funcao: string;
    funcaoPagamento: string;
    horario: string;
    horarioPagamento: string;
    numeroEdocs?: string;
    /** S2.8.3 — Status verificado pela planilha (VERIFICADO/PENDENTE). */
    statusTroca?: 'VERIFICADO' | 'PENDENTE';
  },
  dataIso: string,
  matcher: NomeMatcher,
  inconsistencias: MapaForcaInconsistencia[],
  chopHabilitados: Set<string>,
): {
  substituidoRaw: string;
  substituidoNf?: string;
  substitutoRaw: string;
  substitutoNf?: string;
  periodo: string;
  funcao?: string;
  numeroEdocs?: string;
  origemAutorizada: boolean;
  statusTroca?: 'VERIFICADO' | 'PENDENTE';
} {
  const isLadoEscala = troca.dataEscala === dataIso;
  const escaladoRaw = isLadoEscala ? troca.escaladoOriginal : troca.escaladoPagamento;
  const substitutoRaw = isLadoEscala ? troca.substituto : troca.substitutoPagamento;
  const funcao = isLadoEscala ? troca.funcao : troca.funcaoPagamento;
  const horario = isLadoEscala ? troca.horario : troca.horarioPagamento;

  // S2.8.3 — usa NF direto da planilha (cols G/K) quando disponível
  // no lado escala. No lado pagamento, os papéis se invertem (escalado
  // do pagamento = substituto da troca original, e vice-versa).
  const escaladoNfDireto = isLadoEscala ? troca.escaladoOriginalNf : troca.substitutoNf;
  const substitutoNfDireto = isLadoEscala ? troca.substitutoNf : troca.escaladoOriginalNf;

  const substituidoNf =
    escaladoNfDireto ??
    resolverNfTrocaAutorizada(escaladoRaw, 'escalado', matcher, inconsistencias);
  const substitutoNf =
    substitutoNfDireto ??
    resolverNfTrocaAutorizada(substitutoRaw, 'substituto', matcher, inconsistencias);

  // S0.5/0.1.1.3 — Quando a função da troca envolve Chefe de Operações,
  // validar que o substituto está habilitado (presente na planilha ChOp).
  // Sem essa restrição, qualquer militar viraria ChOp ad-hoc na PD.
  if (funcao && /CHOP|CHEFE\s+DE\s+OPERA/i.test(funcao)) {
    if (substitutoNf && chopHabilitados.size > 0 && !chopHabilitados.has(substitutoNf)) {
      inconsistencias.push({
        tipo: 'NF_NAO_RESOLVIDO',
        mensagem: `Trocas Autorizadas: substituto "${substitutoRaw}" não está habilitado a ser Chefe de Operações (ausente na planilha de escala ChOp).`,
        detalhe: {
          origem: 'troca-chop-nao-habilitado',
          substitutoRaw,
          substitutoNf,
          funcao,
        },
      });
    }
  }

  return {
    substituidoRaw: escaladoRaw,
    substituidoNf,
    substitutoRaw,
    substitutoNf,
    periodo: horario || 'horário não informado',
    funcao: funcao || undefined,
    numeroEdocs: troca.numeroEdocs,
    origemAutorizada: true,
    statusTroca: troca.statusTroca,
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
  inconsistencias: MapaForcaInconsistencia[],
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

/**
 * S0.5 + S0.x — Aplica um swap **person-based** de militares dentro da
 * mesma equipe.
 *
 * Identifica os militares ocupando as duas posições escolhidas (origemA
 * e origemB) e troca **TODAS** as ocorrências de cada um pelo outro na
 * `tripulacao` (mantendo viatura/função fixas). Mutação in-place.
 *
 * Exemplo (item 5 do refactor): se CB KREUZ está escalado em ATB e
 * Plataforma e o Fiscal o troca por CB ELSON (escalado como COV do
 * ABTS), ELSON passa a ocupar **ambas** as posições de KREUZ
 * (ATB + Plataforma) e KREUZ ocupa a única posição de ELSON
 * (COV ABTS). Swap simétrico — equivale a "trocar todas as
 * ocorrências do militar X com todas as ocorrências do militar Y".
 *
 * Lados não encontrados, equipes diferentes ou casos onde não é possível
 * identificar 2 militares distintos registram inconsistência e o swap é
 * descartado.
 *
 * Como o swap acontece sobre `tripulacao` ANTES de `buildComposicaoMf`,
 * a composição resultante já reflete o swap — não precisa duplicar o
 * trabalho.
 */
function aplicarSwapMilitar(
  swap: PreviaSwapMilitar,
  tripulacao: TripulacaoEntry[],
  inconsistencias: MapaForcaInconsistencia[],
): void {
  const a = tripulacao.find(
    (t) => t.equipe === swap.equipe && t.viatura === swap.viaturaA && t.funcao === swap.funcaoA,
  );
  const b = tripulacao.find(
    (t) => t.equipe === swap.equipe && t.viatura === swap.viaturaB && t.funcao === swap.funcaoB,
  );
  if (!a || !b) {
    inconsistencias.push({
      tipo: 'NF_NAO_RESOLVIDO',
      mensagem: `Swap inválido: posição ${!a ? swap.viaturaA + '/' + swap.funcaoA : swap.viaturaB + '/' + swap.funcaoB} não encontrada na equipe ${swap.equipe}.`,
      detalhe: { origem: 'swap-militar', swap: swap as unknown as Record<string, unknown> },
    });
    return;
  }

  // Captura snapshot dos militares originais ANTES de qualquer mutação.
  const refA = a.militarRef;
  const resolvidoA = a.militarResolvido;
  const refB = b.militarRef;
  const resolvidoB = b.militarResolvido;

  // Mesmo militar nos dois lados → no-op.
  if (sameMilitar(refA, resolvidoA, refB, resolvidoB)) {
    inconsistencias.push({
      tipo: 'NF_NAO_RESOLVIDO',
      mensagem: `Swap inválido: as duas posições estão ocupadas pelo mesmo militar.`,
      detalhe: { origem: 'swap-militar', swap: swap as unknown as Record<string, unknown> },
    });
    return;
  }

  // Person-based swap: troca TODAS as ocorrências de A por B (e vice-versa)
  // dentro da MESMA equipe.
  for (const t of tripulacao) {
    if (t.equipe !== swap.equipe) continue;
    if (sameMilitar(t.militarRef, t.militarResolvido, refA, resolvidoA)) {
      t.militarRef = refB;
      t.militarResolvido = resolvidoB;
    } else if (sameMilitar(t.militarRef, t.militarResolvido, refB, resolvidoB)) {
      t.militarRef = refA;
      t.militarResolvido = resolvidoA;
    }
  }
}

/**
 * S2.10.7c — Aplica uma troca APROVADA à tripulação. Localiza o militar com
 * `nf == substituidoNf` (em qualquer recurso/função/equipe) e o substitui
 * pelos dados do militar com `nf == substitutoNf` resolvido pelo efetivo.
 *
 * - Skip silencioso quando `substituidoNf` ou `substitutoNf` ausentes.
 *   (Trocas autorizadas sem NF não dá pra aplicar com segurança.)
 * - Skip + inconsistência quando o substituto não está no efetivo consolidado.
 * - Idempotente: se já foi aplicada (militar atual já é o substituto),
 *   o `find` por substituidoNf não encontra ninguém e retorna a tripulação
 *   inalterada.
 *
 * Diferente de `aplicarSwapMilitar`, aqui é uma SUBSTITUIÇÃO (não swap A↔B):
 * o substituído sai e o substituto entra na mesma posição.
 */
function aplicarTrocaAprovadaEmTripulacao(
  tripulacao: TripulacaoEntry[],
  troca: {
    substituidoNf?: string;
    substitutoNf?: string;
    substituidoRaw: string;
    substitutoRaw: string;
  },
  efetivoByNf: Map<string, Militar>,
  inconsistencias: MapaForcaInconsistencia[],
): TripulacaoEntry[] {
  if (!troca.substituidoNf || !troca.substitutoNf) return tripulacao;
  const substituto = efetivoByNf.get(troca.substitutoNf);
  if (!substituto) {
    inconsistencias.push({
      tipo: 'NF_NAO_RESOLVIDO',
      mensagem: `Troca aprovada: substituto NF ${troca.substitutoNf} (${troca.substitutoRaw}) não está no efetivo consolidado.`,
      detalhe: {
        origem: 'troca-aprovada',
        substituidoNf: troca.substituidoNf,
        substitutoNf: troca.substitutoNf,
      },
    });
    return tripulacao;
  }
  return tripulacao.map((t) => {
    if (t.militarResolvido?.nf !== troca.substituidoNf) return t;
    const nomeGuerra = substituto.nomeGuerra ?? substituto.nome.split(' ')[0] ?? substituto.nome;
    return {
      ...t,
      militarRef: {
        raw: `${substituto.posto} ${nomeGuerra}`,
        postoAbreviado: substituto.posto,
        nomeGuerra,
        nf: substituto.nf,
      },
      militarResolvido: substituto,
    };
  });
}

/**
 * Compara 2 militares para fins de propagação de swap. Prefere `nf`
 * quando ambos resolvidos; cai em comparação por `raw` quando algum
 * deles não tem NF resolvida.
 */
function sameMilitar(
  refX: MilitarRef,
  resolvidoX: Militar | null,
  refY: MilitarRef,
  resolvidoY: Militar | null,
): boolean {
  if (resolvidoX && resolvidoY) return resolvidoX.nf === resolvidoY.nf;
  return refX.raw.trim().toUpperCase() === refY.raw.trim().toUpperCase();
}

/**
 * Aplica o override de par 01↔02 no array de tripulação: toda entrada com
 * viatura == "<RECURSO> 01" passa a "<RECURSO> 02" e vice-versa. Idempotente
 * sob swap único (chamar duas vezes anula). ABTS usa underscore ("ABTS_01");
 * os demais usam espaço.
 */
const PARES_VIATURA: Record<ParRecurso, [string, string]> = {
  ABTS: ['ABTS_01', 'ABTS_02'],
  RESGATE: ['RESGATE 01', 'RESGATE 02'],
  SALVAMAR: ['SALVAMAR 01', 'SALVAMAR 02'],
  QUADRICICLO: ['QUADRICICLO 01', 'QUADRICICLO 02'],
  MERGULHO: ['MERGULHO 01', 'MERGULHO 02'],
};

function aplicarOverrideParRecurso(par: ParRecurso, tripulacao: TripulacaoEntry[]): void {
  const [v01, v02] = PARES_VIATURA[par];
  for (const t of tripulacao) {
    if (t.viatura === v01) t.viatura = v02;
    else if (t.viatura === v02) t.viatura = v01;
  }
}

/** Re-export para uso em tests/controller. */
export { TIPO_IDEO, type TipoIdeo };

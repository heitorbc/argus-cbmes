import { ConflictException, Injectable } from '@nestjs/common';
import {
  diaSeguinteIso,
  formatDataBr,
  PERIODO_TROCA_PREDEFINIDO_LABEL,
  type Militar,
  type ParteDiaria,
  type ParteDiariaEscalaOperacionalEntry,
  type ParteDiariaEscalaOperacionalMilitar,
  type ParteDiariaMilitarRef,
  type ParteDiariaOverride,
  type PreviaAtestado,
  type PreviaDispensa,
  type PreviaDoDia,
  type PreviaNotaServico,
  type PreviaTroca,
  type TrocaEscalaEspecial,
  type AlteracaoDiversa,
} from '@argus/shared-types';
import { MateriaisService } from '../materiais/materiais.service';
import { PreviaService } from '../previa/previa.service';

/**
 * S10 — Parte Diária.
 *
 * Composição do documento institucional a partir de tudo que a PreviaService
 * já agrega (composicaoMf, fiscal, dispensas, atestados, NS, ideoStatus,
 * alterações diversas) + override editável persistido in-memory por data.
 *
 * `get(data)` devolve sempre o estado consolidado (rascunho ⊕ override).
 * `salvar(data, override, editor)` substitui o override completo e devolve
 * o documento final.
 *
 * Persistência in-memory (Fase 1). Em S5b vira tabela `parte_diaria` com
 * coluna JSONB para o override e índice por data.
 */
@Injectable()
export class ParteDiariaService {
  private readonly overrides: Map<string, ParteDiariaOverride> = new Map();
  private readonly metaByData: Map<string, { ultimaEdicaoEm: string; ultimoEditorNf: string }> =
    new Map();
  /** PD lock — quando o Fiscal finaliza, edições ficam bloqueadas até `reabrir()`. */
  private readonly lockByData: Map<string, { finalizadoEm: string; finalizadoPorNf: string }> =
    new Map();

  constructor(
    private readonly previa: PreviaService,
    private readonly materiais: MateriaisService,
  ) {}

  async get(dataIso: string): Promise<ParteDiaria> {
    const rascunho = await this.gerarRascunho(dataIso);
    const override = this.overrides.get(dataIso);
    const merged = override ? aplicarOverride(rascunho, override) : rascunho;
    const meta = this.metaByData.get(dataIso);
    const lock = this.lockByData.get(dataIso);
    return {
      ...merged,
      ultimaEdicaoEm: meta?.ultimaEdicaoEm ?? merged.ultimaEdicaoEm,
      ultimoEditorNf: meta?.ultimoEditorNf ?? merged.ultimoEditorNf,
      finalizadoEm: lock?.finalizadoEm ?? null,
      finalizadoPorNf: lock?.finalizadoPorNf ?? null,
    };
  }

  async salvar(
    dataIso: string,
    override: ParteDiariaOverride,
    editorNf: string,
  ): Promise<ParteDiaria> {
    if (this.lockByData.has(dataIso)) {
      throw new ConflictException(
        `Parte Diária de ${dataIso} está finalizada — reabra antes de editar.`,
      );
    }
    this.overrides.set(dataIso, override);
    this.metaByData.set(dataIso, {
      ultimaEdicaoEm: new Date().toISOString(),
      ultimoEditorNf: editorNf,
    });
    return this.get(dataIso);
  }

  /**
   * PD lock — finaliza o documento. Edições subsequentes via `salvar()`
   * lançam 409 até `reabrir()`. Idempotente: chamada extra atualiza o
   * timestamp e o NF do último finalizador.
   */
  async finalizar(dataIso: string, fiscalNf: string): Promise<ParteDiaria> {
    this.lockByData.set(dataIso, {
      finalizadoEm: new Date().toISOString(),
      finalizadoPorNf: fiscalNf,
    });
    return this.get(dataIso);
  }

  /** Remove o lock (admin only — controller decide o RBAC). */
  async reabrir(dataIso: string): Promise<ParteDiaria> {
    this.lockByData.delete(dataIso);
    return this.get(dataIso);
  }

  /** Útil em tests — limpa overrides, meta e locks. */
  reset(): void {
    this.overrides.clear();
    this.metaByData.clear();
    this.lockByData.clear();
  }

  private async gerarRascunho(dataIso: string): Promise<ParteDiaria> {
    const previa = await this.previa.getPreviaDoDia(dataIso);
    const proximoDia = diaSeguinteIso(dataIso);

    const fiscalQueAssume = previa.fiscal?.militarResolvido
      ? toMilitarRef(previa.fiscal.militarResolvido)
      : null;

    return {
      data: dataIso,
      proximoDia,
      equipe: previa.equipe,
      equipeNome: previa.equipeNome,
      fiscalQueAssume,
      fiscalQuePassa: null,
      fiscalSubstituto: null,
      textoAssuncao: gerarTextoAssuncao(fiscalQueAssume, null),
      escalasOperacionais: previa.composicaoMf.map(mapEscalaOperacional),
      textoTrocas: gerarTextoTrocas(previa.trocas, previa.trocasEscalaEspecial),
      textoEscalaEspecial: gerarTextoEscalaEspecial(
        previa.escalaEspecialAtos,
        previa.trocasEscalaEspecial,
      ),
      textoEscalaExtraordinaria: 'Não houve.',
      textoIseo: gerarTextoIseo(previa.notasServico),
      escalaGuarda: [],
      escalaFaxina: [],
      rondaNoturna: [],
      passagemServicoManha: [],
      textoInstrucao: 'Não houve.',
      textoIdeoFiscal:
        previa.textoAtestadoIdeoFiscal ?? 'Pendente: Fiscal ainda não atestou a IDEO do dia (S6i).',
      textoCumprimentoNs: gerarTextoCumprimentoNs(previa.notasServico),
      textoAlteracaoAlmoxarifado: gerarTextoAlteracaoAlmoxarifado(
        this.materiais.listarPendenciasDoDia(dataIso),
      ),
      textoAlteracaoViaturas: 'Não houve.',
      textoAlteracoesDiversas: gerarTextoAlteracoesDiversas(
        previa.alteracoesDiversas,
        previa.dispensas,
        previa.atestados,
      ),
      ocorrenciasConfeccionadas: [],
      textoPassagemServico: gerarTextoPassagemPadrao(),
      geradoEm: new Date().toISOString(),
      ultimaEdicaoEm: null,
      ultimoEditorNf: null,
      finalizadoEm: null,
      finalizadoPorNf: null,
    };
  }
}

function toMilitarRef(m: Militar): ParteDiariaMilitarRef {
  return {
    posto: m.posto,
    nome: m.nome,
    nomeGuerra: m.nomeGuerra,
    nf: m.nf,
  };
}

function mapEscalaOperacional(
  entry: PreviaDoDia['composicaoMf'][number],
): ParteDiariaEscalaOperacionalEntry {
  const militares: ParteDiariaEscalaOperacionalMilitar[] = [];

  // S6n/0.6 — Equipes compostas por 1 militar acumulam Chefe+Motorista.
  // Caso típico: ATB / PLATAFORMA / DRO TELEFONISTA — o XLSX tem só uma
  // entry (com funcao "Mot" ou "Ch") e aqui mostramos como "Chefe/Motorista"
  // na tabela operacional da PD. No MF (composicaoMf) só motorista é
  // preenchido — esta função gera apenas a apresentação textual da PD.
  const total = (entry.chefe ? 1 : 0) + (entry.motorista ? 1 : 0) + entry.operadores.length;
  if (total === 1 && (entry.motorista || entry.chefe) && entry.operadores.length === 0) {
    const unico = (entry.chefe ?? entry.motorista)!;
    militares.push(mapMilitar('Chefe/Motorista', unico));
  } else {
    if (entry.chefe) militares.push(mapMilitar('Chefe', entry.chefe));
    if (entry.motorista) militares.push(mapMilitar('Motorista', entry.motorista));
    for (let i = 0; i < entry.operadores.length; i += 1) {
      militares.push(mapMilitar(`Operador ${i + 1}`, entry.operadores[i]!));
    }
  }
  return {
    recurso: entry.recurso,
    vtrPrefixo: entry.vtrPrefixo ?? null,
    vtrStatus: entry.vtrStatus,
    kmInicial: null,
    militares,
  };
}

function mapMilitar(
  funcao: string,
  m: PreviaDoDia['composicaoMf'][number]['chefe'] & {},
): ParteDiariaEscalaOperacionalMilitar {
  return {
    funcao,
    militarRaw: m.raw,
    militarNf: m.militarResolvido?.nf ?? null,
    observacao: m.isFiscal ? '(Fiscal)' : '',
  };
}

function gerarTextoAssuncao(
  fiscalQueAssume: ParteDiariaMilitarRef | null,
  fiscalQuePassa: ParteDiariaMilitarRef | null,
): string {
  if (!fiscalQueAssume) {
    return 'Às 07h10, eu, [Fiscal de Serviço], assumi o serviço de Fiscal de Serviço.';
  }
  const assume = formatPostoNome(fiscalQueAssume);
  if (fiscalQuePassa) {
    const passa = formatPostoNome(fiscalQuePassa);
    return `Às 07h10, eu, ${assume}, assumi o serviço de Fiscal de Serviço, em substituição ao ${passa}.`;
  }
  return `Às 07h10, eu, ${assume}, assumi o serviço de Fiscal de Serviço.`;
}

function formatPostoNome(m: ParteDiariaMilitarRef): string {
  return `${m.posto} ${m.nome}`.replace(/\s+/g, ' ').trim();
}

function gerarTextoTrocas(
  trocas: readonly PreviaTroca[],
  trocasEspecial: readonly TrocaEscalaEspecial[],
): string {
  const items: string[] = [];
  for (const t of trocas) {
    const periodo = formatPeriodoTroca(t.periodo);
    const sub = t.substituidoNf ? `${t.substituidoRaw}, NF ${t.substituidoNf}` : t.substituidoRaw;
    const por = t.substitutoNf ? `${t.substitutoRaw}, NF ${t.substitutoNf}` : t.substitutoRaw;
    const motivo = t.motivo ? ` (${t.motivo})` : '';
    items.push(`O ${por} substituiu o ${sub}, no período ${periodo}${motivo}.`);
  }
  for (const t of trocasEspecial) {
    const sub = t.substituidoNf ? `${t.substituidoRaw}, NF ${t.substituidoNf}` : t.substituidoRaw;
    const por = t.substitutoNf ? `${t.substitutoRaw}, NF ${t.substitutoNf}` : t.substitutoRaw;
    items.push(
      `O ${por} substituiu o ${sub}, na função de ${t.atoOriginal.funcao}, no horário ${t.atoOriginal.horario}, na escala especial.`,
    );
  }
  if (items.length === 0) return 'Não houve.';
  return items.map((s, i) => `${i + 1}. ${s}`).join('\n');
}

function formatPeriodoTroca(p: PreviaTroca['periodo']): string {
  if (typeof p === 'string') return p;
  if (p.tipo === 'predefinido') return PERIODO_TROCA_PREDEFINIDO_LABEL[p.valor];
  return `das ${p.horaInicio} às ${p.horaFim}`;
}

function gerarTextoEscalaEspecial(
  atos: readonly PreviaDoDia['escalaEspecialAtos'][number][],
  trocas: readonly TrocaEscalaEspecial[],
): string {
  if (atos.length === 0 && trocas.length === 0) return 'Não houve.';
  const linhas: string[] = [];
  for (const a of atos) {
    linhas.push(
      `O ${a.militarRaw} cumpriu escala especial, no horário ${a.horario}, na função de ${a.funcao}.`,
    );
  }
  return linhas.join('\n');
}

function gerarTextoIseo(notas: readonly PreviaNotaServico[]): string {
  const iseos = notas.filter((n) => /ISEO/i.test(n.codigo) || /ISEO/i.test(n.descricao ?? ''));
  if (iseos.length === 0) return 'Não houve.';
  return iseos.map((n) => `- ${n.codigo}: ${n.descricao ?? '(sem descrição)'}`).join('\n');
}

function gerarTextoCumprimentoNs(notas: readonly PreviaNotaServico[]): string {
  if (notas.length === 0) return 'Não houve.';
  return notas
    .map((n, i) => {
      const horario = n.horaInicio && n.horaFim ? ` das ${n.horaInicio} às ${n.horaFim}` : '';
      const vtr = n.viaturaPrefixo ? ` na VTR ${n.viaturaPrefixo}` : '';
      const militares =
        n.militares && n.militares.length > 0
          ? ` Militares: ${n.militares.map((m) => m.raw).join(', ')}.`
          : '';
      return `${i + 1}. ${n.codigo} — ${n.descricao ?? '(sem descrição)'}${horario}${vtr}.${militares}`;
    })
    .join('\n');
}

function gerarTextoAlteracoesDiversas(
  alteracoes: readonly PreviaDoDia['alteracoesDiversas'][number][],
  dispensas: readonly PreviaDispensa[],
  atestados: readonly PreviaAtestado[],
): string {
  const blocos: string[] = [];
  for (const d of dispensas) {
    const tipo = d.tipoLabel ?? d.tipo ?? 'dispensa';
    blocos.push(
      `O ${d.militarRaw}${d.militarNf ? `, NF ${d.militarNf}` : ''} encontra-se em dispensa (${tipo}) por ${d.dias ?? '?'} dia(s) a partir de ${d.dataInicio ? formatDataBr(d.dataInicio) : '?'}.`,
    );
  }
  for (const a of atestados) {
    blocos.push(
      `O ${a.militarRaw}, NF ${a.militarNf}, encontra-se de atestado médico (CID-10 ${a.cid10}) por ${a.dias} dia(s) a partir de ${formatDataBr(a.dataInicio)}.`,
    );
  }
  for (const alt of alteracoes) {
    blocos.push(formatarAlteracaoDiversa(alt));
  }
  if (blocos.length === 0) return 'Não houve.';
  return blocos.map((b, i) => `${i + 1}. ${b}`).join('\n');
}

function formatarAlteracaoDiversa(alt: AlteracaoDiversa): string {
  if (alt.tipo === 'observacao') {
    return alt.observacao ?? alt.motivo ?? '(sem descrição)';
  }
  if (alt.tipo === 'troca_militar') {
    const orig = alt.militarOriginalRaw
      ? `${alt.militarOriginalRaw}${alt.militarOriginalNf ? `, NF ${alt.militarOriginalNf}` : ''}`
      : 'militar original';
    const sub = alt.militarSubstitutoRaw
      ? `${alt.militarSubstitutoRaw}${alt.militarSubstitutoNf ? `, NF ${alt.militarSubstitutoNf}` : ''}`
      : 'substituto';
    const motivo = alt.motivo ? ` (${alt.motivo})` : '';
    const ctx = alt.recurso ? ` no ${alt.recurso}${alt.funcao ? `/${alt.funcao}` : ''}` : '';
    return `Troca de militar${ctx}: ${sub} substituiu ${orig}${motivo}.`;
  }
  // mudanca_viatura
  const vtr = alt.vtrPrefixo ? ` ${alt.vtrPrefixo}` : '';
  const de = alt.statusViaturaAnterior ? ` de ${alt.statusViaturaAnterior}` : '';
  const para = alt.statusViaturaNovo ? ` para ${alt.statusViaturaNovo}` : '';
  const motivo = alt.motivo ? ` (${alt.motivo})` : '';
  return `Mudança da VTR${vtr}${de}${para}${motivo}.`;
}

function gerarTextoAlteracaoAlmoxarifado(
  pendencias: ReadonlyArray<{
    vtrPrefixo: string;
    label: string;
    status: string;
    observacao?: string;
  }>,
): string {
  if (pendencias.length === 0) return 'Não houve.';
  return pendencias
    .map((p, i) => {
      const obs = p.observacao ? ` — ${p.observacao}` : '';
      const statusLabel = p.status === 'AUSENTE' ? 'Faltando' : 'Danificado';
      return `${i + 1}. ${p.vtrPrefixo}: ${p.label} (${statusLabel}${obs}).`;
    })
    .join('\n');
}

function gerarTextoPassagemPadrao(): string {
  return 'No horário regulamentar, passei o serviço ao meu substituto, informando-o todas as alterações e ordens em vigor.';
}

function aplicarOverride(rascunho: ParteDiaria, ov: ParteDiariaOverride): ParteDiaria {
  return {
    ...rascunho,
    fiscalQuePassa: ov.fiscalQuePassa !== undefined ? ov.fiscalQuePassa : rascunho.fiscalQuePassa,
    fiscalSubstituto:
      ov.fiscalSubstituto !== undefined ? ov.fiscalSubstituto : rascunho.fiscalSubstituto,
    textoAssuncao:
      ov.textoAssuncao !== undefined
        ? ov.textoAssuncao
        : // Se override de fiscalQuePassa foi setado e textoAssuncao não, regera
          ov.fiscalQuePassa !== undefined
          ? gerarTextoAssuncao(rascunho.fiscalQueAssume, ov.fiscalQuePassa)
          : rascunho.textoAssuncao,
    escalasOperacionais: ov.kmInicialPorRecurso
      ? rascunho.escalasOperacionais.map((e) => ({
          ...e,
          kmInicial:
            ov.kmInicialPorRecurso![e.recurso] !== undefined
              ? ov.kmInicialPorRecurso![e.recurso]!
              : e.kmInicial,
        }))
      : rascunho.escalasOperacionais,
    textoTrocas: ov.textoTrocas !== undefined ? ov.textoTrocas : rascunho.textoTrocas,
    textoEscalaEspecial:
      ov.textoEscalaEspecial !== undefined ? ov.textoEscalaEspecial : rascunho.textoEscalaEspecial,
    textoEscalaExtraordinaria:
      ov.textoEscalaExtraordinaria !== undefined
        ? ov.textoEscalaExtraordinaria
        : rascunho.textoEscalaExtraordinaria,
    textoIseo: ov.textoIseo !== undefined ? ov.textoIseo : rascunho.textoIseo,
    escalaGuarda: ov.escalaGuarda !== undefined ? ov.escalaGuarda : rascunho.escalaGuarda,
    escalaFaxina: ov.escalaFaxina !== undefined ? ov.escalaFaxina : rascunho.escalaFaxina,
    rondaNoturna: ov.rondaNoturna !== undefined ? ov.rondaNoturna : rascunho.rondaNoturna,
    passagemServicoManha:
      ov.passagemServicoManha !== undefined
        ? ov.passagemServicoManha
        : rascunho.passagemServicoManha,
    textoInstrucao: ov.textoInstrucao !== undefined ? ov.textoInstrucao : rascunho.textoInstrucao,
    textoCumprimentoNs:
      ov.textoCumprimentoNs !== undefined ? ov.textoCumprimentoNs : rascunho.textoCumprimentoNs,
    textoAlteracaoAlmoxarifado:
      ov.textoAlteracaoAlmoxarifado !== undefined
        ? ov.textoAlteracaoAlmoxarifado
        : rascunho.textoAlteracaoAlmoxarifado,
    textoAlteracaoViaturas:
      ov.textoAlteracaoViaturas !== undefined
        ? ov.textoAlteracaoViaturas
        : rascunho.textoAlteracaoViaturas,
    textoAlteracoesDiversas:
      ov.textoAlteracoesDiversas !== undefined
        ? ov.textoAlteracoesDiversas
        : rascunho.textoAlteracoesDiversas,
    ocorrenciasConfeccionadas:
      ov.ocorrenciasConfeccionadas !== undefined
        ? ov.ocorrenciasConfeccionadas
        : rascunho.ocorrenciasConfeccionadas,
    textoPassagemServico:
      ov.textoPassagemServico !== undefined
        ? ov.textoPassagemServico
        : rascunho.textoPassagemServico,
  };
}

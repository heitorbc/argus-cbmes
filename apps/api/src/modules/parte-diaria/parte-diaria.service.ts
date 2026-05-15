import { ConflictException, Injectable } from '@nestjs/common';
import {
  diaSeguinteIso,
  formatDataBr,
  PERIODO_TROCA_PREDEFINIDO_LABEL,
  type AlteracaoDiversa,
  type LocalFaxina,
  type MapaForcaDoDia,
  type Militar,
  type ParteDiaria,
  type ParteDiariaEscalaOperacionalEntry,
  type ParteDiariaEscalaOperacionalMilitar,
  type ParteDiariaGuardaEntry,
  type ParteDiariaMilitarRef,
  type ParteDiariaOverride,
  type ParteDiariaRondaEntry,
  type PreviaAtestado,
  type PreviaDispensa,
  type PreviaNotaServico,
  type PreviaTroca,
  type TrocaEscalaEspecial,
  type Viatura,
} from '@argus/shared-types';
import { ConferenciaViaturaService } from '../conferencia-viatura/conferencia-viatura.service';
import { LocaisFaxinaService } from '../locais-faxina/locais-faxina.service';
import { MapaForcaService } from '../mapa-forca/mapa-forca.service';
import { MateriaisService } from '../materiais/materiais.service';
import { ViaturasService } from '../viaturas/viaturas.service';

/**
 * S10 / S0.x — Parte Diária fiel ao modelo institucional
 * (`data/Parte Diarias - 5 MAIO/2026.01.25 - 1ªCIA 1ºBBM - PARTE DIÁRIA.docx`).
 *
 * O rascunho é montado a partir de:
 *  - Prévia D, D-1 e D+1 (composicaoMf, fiscal, dispensas, atestados, NS, ideoStatus,
 *    alterações diversas) — Fiscal D-1 alimenta Assunção, Fiscal D+1 alimenta Passagem.
 *  - Conferência da Viatura + ViaturasService → KM inicial por recurso.
 *  - LocaisFaxinaService → vocabulário do select de Faxina.
 *
 * Override editável persistido in-memory (Fase 1; migra para Prisma em S5b).
 */
@Injectable()
export class ParteDiariaService {
  private readonly overrides: Map<string, ParteDiariaOverride> = new Map();
  private readonly metaByData: Map<string, { ultimaEdicaoEm: string; ultimoEditorNf: string }> =
    new Map();
  private readonly lockByData: Map<string, { finalizadoEm: string; finalizadoPorNf: string }> =
    new Map();

  constructor(
    private readonly previa: MapaForcaService,
    private readonly materiais: MateriaisService,
    private readonly conferenciaViatura: ConferenciaViaturaService,
    private readonly viaturas: ViaturasService,
    private readonly locaisFaxina: LocaisFaxinaService,
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

  async finalizar(dataIso: string, fiscalNf: string): Promise<ParteDiaria> {
    this.lockByData.set(dataIso, {
      finalizadoEm: new Date().toISOString(),
      finalizadoPorNf: fiscalNf,
    });
    return this.get(dataIso);
  }

  async reabrir(dataIso: string): Promise<ParteDiaria> {
    this.lockByData.delete(dataIso);
    return this.get(dataIso);
  }

  reset(): void {
    this.overrides.clear();
    this.metaByData.clear();
    this.lockByData.clear();
  }

  private async gerarRascunho(dataIso: string): Promise<ParteDiaria> {
    const previa = await this.previa.getMapaForcaDoDia(dataIso);
    const proximoDia = diaSeguinteIso(dataIso);
    const diaAnterior = diaAnteriorIso(dataIso);

    // S0.x/parte-diaria — Fiscal D-1 e D+1 vêm do MapaForca dos dias
    // adjacentes (calcularFiscal já é chamado lá). Custo: 2 chamadas extras
    // de getMapaForcaDoDia. Em prod com cache, virá de poucos ms.
    const fiscalAnterior = await this.previa
      .getMapaForcaDoDia(diaAnterior)
      .then((p) => p.fiscal?.militarResolvido ?? null)
      .catch(() => null);
    const fiscalSeguinte = await this.previa
      .getMapaForcaDoDia(proximoDia)
      .then((p) => p.fiscal?.militarResolvido ?? null)
      .catch(() => null);

    const fiscalQueAssume = previa.fiscal?.militarResolvido
      ? toMilitarRef(previa.fiscal.militarResolvido)
      : null;
    const fiscalQuePassa = fiscalAnterior ? toMilitarRef(fiscalAnterior) : null;
    const fiscalSubstituto = fiscalSeguinte ? toMilitarRef(fiscalSeguinte) : null;

    // KM inicial por recurso vem do último entry em `historicoKm` da viatura
    // (origem 'conferencia') — set pela ConferenciaViatura S6b.
    const todasViaturas = await this.viaturas.list();
    const viaturasPorPrefixo = new Map<string, Viatura>(
      todasViaturas.map((v) => [v.prefixo, v]),
    );

    const escalasOperacionais = previa.composicaoMf.map((entry) =>
      mapEscalaOperacional(entry, viaturasPorPrefixo),
    );

    const guardas = extrairGuardasDaPrevia(previa);
    const escalaGuarda = gerarGuardaRotativa(guardas);

    const elegiveisRonda = extrairElegiveisRonda(previa);
    const rondaNoturna = gerarTurnosRonda(elegiveisRonda);

    const locais = this.locaisFaxina.list({ ativosOnly: true });

    return {
      data: dataIso,
      proximoDia,
      equipe: previa.equipe,
      equipeNome: previa.equipeNome,
      fiscalQueAssume,
      fiscalQuePassa,
      fiscalSubstituto,
      textoAssuncao: gerarTextoAssuncao(fiscalQueAssume, fiscalQuePassa),
      escalasOperacionais,
      textoTrocas: gerarTextoTrocas(previa.trocas, previa.trocasEscalaEspecial),
      textoEscalaEspecial: gerarTextoEscalaEspecial(
        previa.escalaEspecialAtos,
        previa.trocasEscalaEspecial,
      ),
      textoEscalaExtraordinaria: 'Não houve.',
      textoIseo: gerarTextoIseo(previa.notasServico),
      escalaGuarda,
      escalaFaxina: gerarFaxinaPlaceholder(locais),
      rondaNoturna,
      passagemServicoManha: [],
      textoInstrucao: 'Não houve.',
      textoIdeoFiscal:
        previa.textoAtestadoIdeoFiscal ?? 'Pendente: Fiscal ainda não atestou a IDEO do dia (S6i).',
      textoCumprimentoNs: gerarTextoCumprimentoNs(previa.notasServico),
      textoAlteracaoAlmoxarifado: gerarTextoAlteracaoAlmoxarifado(
        this.materiais.listarPendenciasDoDia(dataIso),
      ),
      textoAlteracaoViaturas: gerarTextoAlteracaoViaturas(
        this.conferenciaViatura.getByData(dataIso),
      ),
      textoAlteracoesDiversas: gerarTextoAlteracoesDiversas(
        previa.alteracoesDiversas,
        previa.dispensas,
        previa.atestados,
      ),
      ocorrenciasConfeccionadas: [],
      ocorrenciasNaoConfeccionadas: [],
      textoPassagemServico: gerarTextoPassagemServico(fiscalSubstituto),
      geradoEm: new Date().toISOString(),
      ultimaEdicaoEm: null,
      ultimoEditorNf: null,
      finalizadoEm: null,
      finalizadoPorNf: null,
    };
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function toMilitarRef(m: Militar): ParteDiariaMilitarRef {
  return {
    posto: m.posto,
    nome: m.nome,
    nomeGuerra: m.nomeGuerra,
    nf: m.nf,
  };
}

function diaAnteriorIso(dataIso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dataIso);
  if (!m) throw new Error(`Data inválida: ${dataIso}`);
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  dt.setUTCDate(dt.getUTCDate() - 1);
  const yy = dt.getUTCFullYear();
  const mo = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mo}-${dd}`;
}

function mapEscalaOperacional(
  entry: MapaForcaDoDia['composicaoMf'][number],
  viaturasPorPrefixo: Map<string, Viatura>,
): ParteDiariaEscalaOperacionalEntry {
  const militares: ParteDiariaEscalaOperacionalMilitar[] = [];
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
  // KM inicial vem do último entry em historicoKm cuja origem é 'conferencia'.
  let kmInicial: number | null = null;
  if (entry.vtrPrefixo) {
    const vtr = viaturasPorPrefixo.get(entry.vtrPrefixo);
    if (vtr?.historicoKm && vtr.historicoKm.length > 0) {
      const conferencias = vtr.historicoKm.filter((h) => h.origem === 'conferencia');
      const ultimo = conferencias[conferencias.length - 1] ?? vtr.historicoKm[vtr.historicoKm.length - 1];
      if (ultimo) kmInicial = ultimo.kmRegistrado;
    } else if (vtr?.kmAtual !== undefined) {
      kmInicial = vtr.kmAtual;
    }
  }
  return {
    recurso: entry.recurso,
    vtrPrefixo: entry.vtrPrefixo ?? null,
    vtrStatus: entry.vtrStatus,
    kmInicial,
    militares,
  };
}

function mapMilitar(
  funcao: string,
  m: MapaForcaDoDia['composicaoMf'][number]['chefe'] & {},
): ParteDiariaEscalaOperacionalMilitar {
  return {
    funcao,
    militarRaw: m.raw,
    militarNf: m.militarResolvido?.nf ?? null,
    observacao: m.isFiscal ? '(Fiscal)' : '',
  };
}

// ── Assunção / Passagem ─────────────────────────────────────────────────────

function gerarTextoAssuncao(
  fiscalQueAssume: ParteDiariaMilitarRef | null,
  fiscalQuePassa: ParteDiariaMilitarRef | null,
): string {
  if (!fiscalQueAssume) {
    return 'Às 07h10, eu, [Fiscal de Serviço], assumi o serviço de Fiscal de Serviço.';
  }
  const assume = formatPostoNomeBM(fiscalQueAssume);
  if (fiscalQuePassa) {
    const passa = formatPostoNomeBM(fiscalQuePassa);
    return `Às 07h10, eu, ${assume}, assumi o serviço de Fiscal de Serviço, em substituição ao ${passa}.`;
  }
  return `Às 07h10, eu, ${assume}, assumi o serviço de Fiscal de Serviço.`;
}

function gerarTextoPassagemServico(fiscalSeguinte: ParteDiariaMilitarRef | null): string {
  if (!fiscalSeguinte) {
    return 'No horário regulamentar, passei o serviço ao meu substituto, informando-o todas as alterações e ordens em vigor.';
  }
  const sub = formatPostoNomeBM(fiscalSeguinte);
  const nf = fiscalSeguinte.nf ? `, NF ${fiscalSeguinte.nf}` : '';
  return `No horário regulamentar, passei o serviço ao meu substituto, ${sub}${nf}, informando-o todas as alterações e ordens em vigor.`;
}

function formatPostoNomeBM(m: ParteDiariaMilitarRef): string {
  const posto = m.posto.trim();
  const nome = (m.nome || m.nomeGuerra || '').trim();
  return `${posto} BM ${nome}`.replace(/\s+/g, ' ').trim();
}

// ── Trocas ──────────────────────────────────────────────────────────────────

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
    const funcao = t.funcao ? ` na função de ${t.funcao}` : '';
    items.push(`O ${por} substituiu o ${sub}${funcao}, no período ${periodo}${motivo}.`);
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

// ── ESPECIAL / ISEO ─────────────────────────────────────────────────────────

/**
 * Gera o texto da seção ESPECIAL no formato institucional:
 * "O {posto} BM {nome}, NF {nf}, cumpriu escala especial no período das {h_ini} às {h_fim}."
 */
function gerarTextoEscalaEspecial(
  atos: readonly MapaForcaDoDia['escalaEspecialAtos'][number][],
  trocas: readonly TrocaEscalaEspecial[],
): string {
  if (atos.length === 0 && trocas.length === 0) return 'Não houve.';
  const linhas: string[] = [];
  for (const a of atos) {
    const periodo = formatHorarioEspecial(a.horario);
    const militar = a.militarRaw.trim();
    // O `militarRaw` já tem posto + nome no formato institucional
    linhas.push(`O ${militar} cumpriu escala especial no período ${periodo}.`);
  }
  return linhas.join('\n');
}

/** Converte "07:10 ÀS 13:10" → "das 07h10 às 13h10". */
function formatHorarioEspecial(horarioRaw: string): string {
  const m = /(\d{1,2}):?(\d{2})\s*(?:ÀS|AS|À|A|às|as|-)\s*(\d{1,2}):?(\d{2})/i.exec(horarioRaw);
  if (!m) return horarioRaw;
  const hi = `${m[1]!.padStart(2, '0')}h${m[2]}`;
  const hf = `${m[3]!.padStart(2, '0')}h${m[4]}`;
  return `das ${hi} às ${hf}`;
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

// ── Alterações Diversas ─────────────────────────────────────────────────────

function gerarTextoAlteracoesDiversas(
  alteracoes: readonly MapaForcaDoDia['alteracoesDiversas'][number][],
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

function extrairHora(iso: string): string {
  const m = /T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return '';
  return `${m[1]}h${m[2]}min`;
}

function formatarAlteracaoDiversa(alt: AlteracaoDiversa): string {
  // S0.x/parte-diaria — Quando há `horarioTroca`, prevalece sobre o
  // timestamp `registradoEm` (representa o instante institucional da
  // troca, não quando foi registrada no sistema).
  const horaTroca = alt.horarioTroca ? alt.horarioTroca.replace(':', 'h') : null;
  const horaReg = extrairHora(alt.registradoEm);
  const hora = horaTroca ?? horaReg;
  const prefixoHora = hora ? `Às ${hora}, ` : '';

  if (alt.tipo === 'observacao') {
    return prefixoHora + (alt.observacao ?? alt.motivo ?? '(sem descrição)');
  }
  if (alt.tipo === 'troca_militar') {
    const orig = alt.militarOriginalRaw
      ? `${alt.militarOriginalRaw}${alt.militarOriginalNf ? `, NF ${alt.militarOriginalNf}` : ''}`
      : 'militar original';
    const sub = alt.militarSubstitutoRaw
      ? `${alt.militarSubstitutoRaw}${alt.militarSubstitutoNf ? `, NF ${alt.militarSubstitutoNf}` : ''}`
      : 'substituto';
    const motivo = alt.motivo ? ` (${alt.motivo})` : '';
    const funcao = alt.funcao ? ` na função de ${alt.funcao}` : '';
    const recurso = alt.recurso ? ` (${alt.recurso})` : '';
    return `${prefixoHora}${orig} foi substituído por ${sub}${funcao}${recurso}${motivo}.`;
  }
  // mudanca_viatura
  const vtr = alt.vtrPrefixo ? ` ${alt.vtrPrefixo}` : '';
  const de = alt.statusViaturaAnterior ? ` de ${alt.statusViaturaAnterior}` : '';
  const para = alt.statusViaturaNovo ? ` para ${alt.statusViaturaNovo}` : '';
  const motivo = alt.motivo ? ` (${alt.motivo})` : '';
  return `${prefixoHora}mudança da VTR${vtr}${de}${para}${motivo}.`;
}

// ── Almoxarifado / Viaturas ─────────────────────────────────────────────────

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

function gerarTextoAlteracaoViaturas(
  conferencias: ReadonlyArray<{
    vtrPrefixo: string;
    statusMudanca?: string;
    motivoBaixa?: string;
    observacao?: string;
  }>,
): string {
  const linhas: string[] = [];
  for (const c of conferencias) {
    if (c.statusMudanca) {
      const motivo = c.motivoBaixa ? ` (${c.motivoBaixa})` : c.observacao ? ` (${c.observacao})` : '';
      linhas.push(`${c.vtrPrefixo}: status alterado para ${c.statusMudanca}${motivo}.`);
    }
  }
  if (linhas.length === 0) return 'Não houve.';
  return linhas.map((l, i) => `${i + 1}. ${l}`).join('\n');
}

// ── Guarda 24h com rodízio cíclico ──────────────────────────────────────────

const GUARDA_HORARIOS: Array<[string, string]> = [
  ['00:00', '02:00'],
  ['02:00', '04:00'],
  ['04:00', '06:00'],
  ['06:00', '08:00'],
  ['08:00', '10:00'],
  ['10:00', '12:00'],
  ['12:00', '14:00'],
  ['14:00', '16:00'],
  ['16:00', '18:00'],
  ['18:00', '20:00'],
  ['20:00', '22:00'],
  ['22:00', '00:00'],
];

function extrairGuardasDaPrevia(previa: MapaForcaDoDia): ParteDiariaMilitarRef[] {
  const entry = previa.composicaoMf.find((c) => c.recurso === 'GUARDA');
  if (!entry) return [];
  const refs: ParteDiariaMilitarRef[] = [];
  for (const m of entry.operadores) {
    refs.push(toMilitarRefSafe(m));
  }
  return refs;
}

function toMilitarRefSafe(m: {
  raw: string;
  postoAbreviado?: string;
  nomeGuerra?: string;
  militarResolvido: Militar | null;
}): ParteDiariaMilitarRef {
  if (m.militarResolvido) return toMilitarRef(m.militarResolvido);
  return {
    posto: m.postoAbreviado ?? '',
    nome: m.nomeGuerra ?? m.raw,
    nomeGuerra: m.nomeGuerra,
    nf: '',
  };
}

/**
 * Gera 12 slots (00–02 ... 22–00) com rodízio cíclico entre os militares
 * de GUARDA. Cada militar carrega o slot "Sentinela 1/2/3" para auditoria
 * (o militar Sent. N entra primeiro no slot N do ciclo).
 */
export function gerarGuardaRotativa(guardas: ParteDiariaMilitarRef[]): ParteDiariaGuardaEntry[] {
  if (guardas.length === 0) {
    return GUARDA_HORARIOS.map(([hi, hf]) => ({
      horarioInicio: hi,
      horarioFim: hf,
      militarNf: undefined,
      militarRaw: '',
      sentinelaSlot: undefined,
      setor: 'PORTÃO DAS ARMAS',
    }));
  }
  return GUARDA_HORARIOS.map(([hi, hf], idx) => {
    const slotIndex = idx % guardas.length;
    const m = guardas[slotIndex]!;
    return {
      horarioInicio: hi,
      horarioFim: hf,
      militarNf: m.nf || undefined,
      militarRaw: formatPostoNomeBM(m),
      sentinelaSlot: ((slotIndex % 3) + 1).toString() as '1' | '2' | '3',
      setor: 'PORTÃO DAS ARMAS',
    };
  });
}

// ── Ronda Noturna 23:10–05:10 dividida em N turnos ──────────────────────────

const RECURSOS_RONDA = new Set([
  'CHEFE DE OPERAÇÕES',
  'ABTS_01',
  'ABTS_02',
  'RESGATE 01',
  'RESGATE 02',
  'ATB',
  'PLATAFORMA',
]);

function extrairElegiveisRonda(previa: MapaForcaDoDia): ParteDiariaMilitarRef[] {
  const out: ParteDiariaMilitarRef[] = [];
  const seen = new Set<string>();
  for (const c of previa.composicaoMf) {
    if (!RECURSOS_RONDA.has(c.recurso)) continue;
    // Para Chefe de Operações: só Motorista entra na ronda (Chefe é livre).
    const incluirChefe = c.recurso !== 'CHEFE DE OPERAÇÕES';
    const todos = [
      ...(incluirChefe && c.chefe ? [c.chefe] : []),
      ...(c.motorista ? [c.motorista] : []),
      ...c.operadores,
    ];
    for (const m of todos) {
      const ref = toMilitarRefSafe(m);
      const key = ref.nf || ref.nome;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(ref);
    }
  }
  return out;
}

/**
 * Divide o intervalo 23:10–05:10 (6h = 360 min) em `militares.length` turnos
 * iguais. Casos:
 *  - 1 militar  → [23:10–05:10]                                                (1 × 360 min)
 *  - 2 militares → [23:10–02:10, 02:10–05:10]                                  (2 × 180 min)
 *  - 3 militares → [23:10–01:10, 01:10–03:10, 03:10–05:10]                     (3 × 120 min)
 *  - 6 militares → 6 × 60 min                                                  (1h cada)
 *  - 0 militares → array vazio (sem ronda)
 */
export function gerarTurnosRonda(elegiveis: ParteDiariaMilitarRef[]): ParteDiariaRondaEntry[] {
  if (elegiveis.length === 0) return [];
  const totalMin = 6 * 60;
  const turnoMin = totalMin / elegiveis.length;
  const startMin = 23 * 60 + 10; // 23:10
  const out: ParteDiariaRondaEntry[] = [];
  for (let i = 0; i < elegiveis.length; i += 1) {
    const ini = (startMin + i * turnoMin) % (24 * 60);
    const fim = (startMin + (i + 1) * turnoMin) % (24 * 60);
    out.push({
      horarioInicio: minToHHmm(ini),
      horarioFim: minToHHmm(fim),
      militarNf: elegiveis[i]!.nf || undefined,
      militarRaw: formatPostoNomeBM(elegiveis[i]!),
      area: 'COMPLEXO DO QCG',
    });
  }
  return out;
}

function minToHHmm(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ── Faxina ──────────────────────────────────────────────────────────────────

function gerarFaxinaPlaceholder(
  _locais: readonly LocalFaxina[],
): MapaForcaDoDia extends never ? never : import('@argus/shared-types').ParteDiariaFaxina[] {
  // Rascunho vazio — Fiscal preenche via UI. Os locais ficam disponíveis
  // via `api.locaisFaxinaList()`.
  return [] as unknown as import('@argus/shared-types').ParteDiariaFaxina[];
}

// ── Apply override ──────────────────────────────────────────────────────────

function aplicarOverride(rascunho: ParteDiaria, ov: ParteDiariaOverride): ParteDiaria {
  return {
    ...rascunho,
    fiscalQuePassa: ov.fiscalQuePassa !== undefined ? ov.fiscalQuePassa : rascunho.fiscalQuePassa,
    fiscalSubstituto:
      ov.fiscalSubstituto !== undefined ? ov.fiscalSubstituto : rascunho.fiscalSubstituto,
    textoAssuncao:
      ov.textoAssuncao !== undefined
        ? ov.textoAssuncao
        : ov.fiscalQuePassa !== undefined
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
    ocorrenciasNaoConfeccionadas:
      ov.ocorrenciasNaoConfeccionadas !== undefined
        ? ov.ocorrenciasNaoConfeccionadas
        : rascunho.ocorrenciasNaoConfeccionadas,
    textoPassagemServico:
      ov.textoPassagemServico !== undefined
        ? ov.textoPassagemServico
        : rascunho.textoPassagemServico,
  };
}

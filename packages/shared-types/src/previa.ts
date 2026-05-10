import { z } from 'zod';
import { LETRA_EQUIPE, type LetraEquipe } from './escala.js';
import { TIPO_DISPENSA } from './dispensa.js';
import { ideoStatusDoDiaSchema, TIPO_IDEO, type TipoIdeo } from './ideo.js';
import { militarSchema, type Militar } from './militar.js';
import { militarRefSchema, type MilitarRef } from './escala.js';
import { alteracaoDiversaSchema, ESTADO_SERVICO, STATUS_CONFERENCIA } from './servico.js';
import { STATUS_VIATURA } from './viatura.js';

/** Tipos de inconsistência detectados na geração da Prévia. */
export const TIPO_INCONSISTENCIA = [
  'SEM_ESCALA_NO_MES',
  'EQUIPE_NAO_ESCALADA_NO_DIA',
  'NF_NAO_RESOLVIDO',
  'AMBIGUIDADE_NOME',
  'FISCAL_SEM_NF_RESOLVIDO',
  'IDEO_NAO_CADASTRADO',
  'VIATURA_DESCONHECIDA',
] as const;
export type TipoInconsistencia = (typeof TIPO_INCONSISTENCIA)[number];

export const previaInconsistenciaSchema = z.object({
  tipo: z.enum(TIPO_INCONSISTENCIA),
  mensagem: z.string(),
  detalhe: z.record(z.unknown()).optional(),
});
export type PreviaInconsistencia = z.infer<typeof previaInconsistenciaSchema>;

/**
 * Linha da tripulação na Prévia (S4-S6a — DEPRECATED em S6b).
 *
 * Combina dados da escala XLSX (raw, posto, nomeGuerra) com a resolução pelo
 * QDI (nf, ant, situacao). Quando não resolve, `militarResolvido` fica `null`
 * e uma inconsistência `NF_NAO_RESOLVIDO` é registrada.
 *
 * **S6b:** substituído por `composicaoMfMilitarSchema` dentro de
 * `composicaoMfEntrySchema` (1 entrada por recurso do MF, com chefe + motorista
 * + operadores). Mantido aqui apenas para tipos legados.
 */
export const previaTripulacaoEntrySchema = z.object({
  equipe: z.enum(LETRA_EQUIPE),
  viatura: z.string(),
  funcao: z.string(),
  militarRef: militarRefSchema,
  militarResolvido: militarSchema.nullable(),
  /** Indica se este militar é o Fiscal de Serviço daquele dia. */
  isFiscal: z.boolean(),
});
export type PreviaTripulacaoEntry = z.infer<typeof previaTripulacaoEntrySchema>;

/**
 * Militar dentro da composição do MF (S6b/F2).
 *
 * Cada militar tem `statusConferencia` para ser marcado pelo Chefe da Equipe
 * durante a Conferência (S6b/F3).
 */
export const composicaoMfMilitarSchema = z.object({
  raw: z.string(),
  postoAbreviado: z.string(),
  nomeGuerra: z.string(),
  militarResolvido: militarSchema.nullable(),
  statusConferencia: z.enum(STATUS_CONFERENCIA).default('pendente'),
  substitutoNf: z.string().optional(),
  substitutoRaw: z.string().optional(),
  isFiscal: z.boolean().default(false),
});
export type ComposicaoMfMilitar = z.infer<typeof composicaoMfMilitarSchema>;

/**
 * Linha da composição do Mapa Força — espelha 1:1 a estrutura do MF.
 * Cada linha = 1 recurso (ex.: ABTS_01, MERGULHO 02) com chefe + motorista +
 * operadores. Substitui `tripulacao` + `viaturasOperacionais` (S6b/F2/ADR-011).
 */
export const composicaoMfEntrySchema = z.object({
  recurso: z.string(),
  vtrPrefixo: z.string().optional(),
  vtrStatus: z.enum(STATUS_VIATURA).nullable(),
  semEquipe: z.boolean().default(false),
  equipe: z.enum(LETRA_EQUIPE).nullable(),
  chefe: composicaoMfMilitarSchema.optional(),
  motorista: composicaoMfMilitarSchema.optional(),
  operadores: z.array(composicaoMfMilitarSchema).default([]),
});
export type ComposicaoMfEntry = z.infer<typeof composicaoMfEntrySchema>;

/** Fiscal de Serviço resolvido (cadastro override ou default por menor ANT). */
export const previaFiscalSchema = z.object({
  militarNf: z.string(),
  militarResolvido: militarSchema.nullable(),
  origem: z.enum(['cadastrado', 'default']),
  fiscalId: z.string().optional(),
  motivo: z.string().optional(),
});
export type PreviaFiscal = z.infer<typeof previaFiscalSchema>;

export const previaIdeoEntrySchema = z.object({
  tipo: z.enum(TIPO_IDEO),
  itens: z.array(z.string()),
});
export type PreviaIdeoEntry = z.infer<typeof previaIdeoEntrySchema>;

/**
 * Período da troca (S6h/1.1).
 *
 * 5 opções predefinidas com horários institucionais + opção `custom` para
 * casos pontuais (hora início e fim livres). Substitui o antigo texto livre.
 */
export const PERIODO_TROCA_PREDEFINIDO = [
  'TURNO_24H',
  'DIURNO_12H', // 07:10 às 19:10
  'NOTURNO_12H', // 19:10 às 07:10
  'MATUTINO_6H', // 07:10 às 13:10
  'VESPERTINO_6H', // 13:10 às 19:10
] as const;
export type PeriodoTrocaPredefinido = (typeof PERIODO_TROCA_PREDEFINIDO)[number];

export const PERIODO_TROCA_PREDEFINIDO_LABEL: Record<PeriodoTrocaPredefinido, string> = {
  TURNO_24H: '24h',
  DIURNO_12H: '12h diurnas (07:10 às 19:10)',
  NOTURNO_12H: '12h noturnas (19:10 às 07:10)',
  MATUTINO_6H: '6h matutinas (07:10 às 13:10)',
  VESPERTINO_6H: '6h vespertinas (13:10 às 19:10)',
};

const horaRegex = /^\d{2}:\d{2}$/;
export const periodoTrocaSchema = z.discriminatedUnion('tipo', [
  z.object({
    tipo: z.literal('predefinido'),
    valor: z.enum(PERIODO_TROCA_PREDEFINIDO),
  }),
  z.object({
    tipo: z.literal('custom'),
    horaInicio: z.string().regex(horaRegex, 'Hora início no formato HH:MM'),
    horaFim: z.string().regex(horaRegex, 'Hora fim no formato HH:MM'),
  }),
]);
export type PeriodoTroca = z.infer<typeof periodoTrocaSchema>;

/**
 * Substituição pontual de militar (S5/F7a).
 *
 * S6h/1.1 — Campo `periodo` migrou de string livre para `PeriodoTroca`
 * estruturado. Para compat com dados antigos, schema aceita ambos: string
 * legacy (será normalizada na leitura) ou o novo objeto.
 */
export const previaTrocaSchema = z.object({
  substituidoNf: z.string().optional(),
  substituidoRaw: z.string(),
  substitutoNf: z.string().optional(),
  substitutoRaw: z.string(),
  /** Período da troca — `string` é legacy (S5); novo formato é `PeriodoTroca` (S6h). */
  periodo: z.union([z.string(), periodoTrocaSchema]),
  motivo: z.string().optional(),
});
export type PreviaTroca = z.infer<typeof previaTrocaSchema>;

/** Escala especial Matutino/Vespertino (S5/F7a). */
export const previaEscalaEspecialSchema = z.object({
  matutina: z.object({ militarRaw: z.string(), militarNf: z.string().optional() }).optional(),
  vespertina: z.object({ militarRaw: z.string(), militarNf: z.string().optional() }).optional(),
});
export type PreviaEscalaEspecial = z.infer<typeof previaEscalaEspecialSchema>;

/** Item de Nota de Serviço aplicada ao dia (ex.: NS072) (S5/F7a). */
export const previaNotaServicoSchema = z.object({
  codigo: z.string(),
  descricao: z.string().optional(),
});
export type PreviaNotaServico = z.infer<typeof previaNotaServicoSchema>;

/**
 * Dispensa do dia exibida na Prévia.
 *
 * S6j — agora derivado da entidade `Dispensa` (`@argus/shared-types/dispensa`).
 * Inclui tipo canônico, período e referência ao registro persistido. Campos
 * `motivo` (string livre, S5) preservados como deprecated p/ compat.
 */
export const previaDispensaSchema = z.object({
  militarRaw: z.string(),
  militarNf: z.string().optional(),
  /** S6j — tipo canônico (I_TAF..VIII_DIVERSAS). */
  tipo: z.enum(TIPO_DISPENSA).optional(),
  tipoLabel: z.string().optional(),
  dataInicio: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  dias: z.number().int().min(1).optional(),
  numeroEdocs: z.string().optional(),
  /** ID da entidade Dispensa (S6j). Quando preenchido, vem do `DispensasService`. */
  dispensaId: z.string().optional(),
  /** @deprecated S5 — usar `tipo` + `numeroEdocs` + `observacoes`. */
  motivo: z.string().optional(),
});
export type PreviaDispensa = z.infer<typeof previaDispensaSchema>;

/**
 * Ato leve da Escala Especial injetado read-only na Prévia (S6a-fix item 4).
 * Identificador único: combinação de `data + militarRaw + horario + funcao`.
 */
export const escalaEspecialAtoLightSchema = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  militarRaw: z.string(),
  horario: z.string(),
  funcao: z.string(),
});
export type EscalaEspecialAtoLight = z.infer<typeof escalaEspecialAtoLightSchema>;

/**
 * Troca de Escala Especial registrada pelo Fiscal (S6a-fix item 4).
 * Persiste em `PreviaDoDia.trocasEscalaEspecial`; será lida pela Parte Diária (S10/S11).
 */
export const trocaEscalaEspecialSchema = z.object({
  atoOriginal: escalaEspecialAtoLightSchema,
  substituidoNf: z.string().optional(),
  substituidoRaw: z.string(),
  substitutoNf: z.string().optional(),
  substitutoRaw: z.string(),
  registradoEm: z.string(),
  registradoPorNf: z.string(),
});
export type TrocaEscalaEspecial = z.infer<typeof trocaEscalaEspecialSchema>;

/** Chefe de Operações escalado num dia (S6a-fix item 6). Vem da planilha ChOp. */
export const chefeOperacoesSchema = z.object({
  posto: z.string(),
  nomeGuerra: z.string(),
  nf: z.string(),
  telefone: z.string().optional(),
  marcador: z.string().optional(),
});
export type ChefeOperacoes = z.infer<typeof chefeOperacoesSchema>;

/**
 * "Ajustes pré-turno" da Prévia — campos adicionais editáveis pelo Fiscal antes do
 * início do serviço. Persistidos em `AjustesPreviaService` (mock in-memory; S5b → Prisma).
 */
export const ajustesPreviaSchema = z.object({
  trocas: z.array(previaTrocaSchema),
  escalaEspecial: previaEscalaEspecialSchema,
  notasServico: z.array(previaNotaServicoSchema),
  dispensas: z.array(previaDispensaSchema),
  trocasEscalaEspecial: z.array(trocaEscalaEspecialSchema).default([]),
});
export type AjustesPrevia = z.infer<typeof ajustesPreviaSchema>;

/** Body do PUT /previa/:data/ajustes — overwrite completo. */
export const upsertAjustesPreviaSchema = ajustesPreviaSchema;
export type UpsertAjustesPreviaInput = z.infer<typeof upsertAjustesPreviaSchema>;

/** Body do POST /previa/:data/ajustes/escala-especial/trocas. */
export const addTrocaEscalaEspecialSchema = z.object({
  atoOriginal: escalaEspecialAtoLightSchema,
  substituidoRaw: z.string().min(1),
  substituidoNf: z.string().optional(),
  substitutoRaw: z.string().min(1),
  substitutoNf: z.string().optional(),
});
export type AddTrocaEscalaEspecialInput = z.infer<typeof addTrocaEscalaEspecialSchema>;

export const previaDoDiaSchema = z.object({
  /** Data ISO `YYYY-MM-DD`. */
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ano: z.number().int(),
  mes: z.number().int(),
  dia: z.number().int(),

  /** Letra da equipe escalada (`null` se nenhum mês carregado para aquela data). */
  equipe: z.enum(LETRA_EQUIPE).nullable(),
  /** Nome institucional ("ALFA"/"BRAVO"/"CHARLIE"/"DELTA") quando equipe definida. */
  equipeNome: z.string().nullable(),

  fiscal: previaFiscalSchema.nullable(),

  /**
   * S6b/F2 — Composição do MF (1 entrada por recurso, com chefe + motorista +
   * operadores). Espelha o shape do MF para preparar a escrita (S9). Substitui
   * `tripulacao` + `viaturasOperacionais` (mantidos como derivados pelo
   * PreviaService durante a transição).
   */
  composicaoMf: z.array(composicaoMfEntrySchema).default([]),

  /**
   * @deprecated em S6b — use `composicaoMf` que tem `statusConferencia` e shape
   * espelhado ao MF. `tripulacao` continua sendo derivado pelo PreviaService
   * para retrocompat com WhatsApp e tests legados.
   */
  tripulacao: z.array(previaTripulacaoEntrySchema),

  /** Itens IDEO do dia, agrupados por tipo de viatura. */
  ideo: z.array(previaIdeoEntrySchema),

  /**
   * S6i — Status de realização da IDEO por tipo (ABTS/RESGATE) no dia. Vazio
   * antes do Fiscal atestar. Quando completo (todos os tipos marcados),
   * `textoAtestadoIdeoFiscal` é gerado para a Parte Diária (S10/S11).
   */
  ideoStatus: z.array(ideoStatusDoDiaSchema).default([]),
  textoAtestadoIdeoFiscal: z.string().nullable().default(null),

  /**
   * @deprecated em S6b — use `composicaoMf[i].vtrPrefixo` + `vtrStatus`.
   * Derivado pelo PreviaService.
   */
  viaturasOperacionais: z.array(
    z.object({
      id: z.string(),
      codigo: z.string(),
      descricao: z.string(),
      vtrStatus: z.string().nullable().optional(),
    }),
  ),

  inconsistencias: z.array(previaInconsistenciaSchema),

  /** F7a — Ajustes pré-turno: trocas, escala especial, NS, dispensas. */
  trocas: z.array(previaTrocaSchema),
  escalaEspecial: previaEscalaEspecialSchema,
  notasServico: z.array(previaNotaServicoSchema),
  dispensas: z.array(previaDispensaSchema),

  /** S6a-fix item 4 — atos da Escala Especial do dia (read-only) + trocas registradas. */
  escalaEspecialAtos: z.array(escalaEspecialAtoLightSchema).default([]),
  trocasEscalaEspecial: z.array(trocaEscalaEspecialSchema).default([]),

  /** S6a-fix item 6 — Chefes de Operações escalados no dia (planilha ChOp externa). */
  chefesOperacoes: z.array(chefeOperacoesSchema).default([]),

  /** S6b/F1 — Estado do Servico do dia (NAO_INICIADO → ENCERRADO). */
  estadoServico: z.enum(ESTADO_SERVICO).default('NAO_INICIADO'),
  iniciadoEm: z.string().optional(),
  iniciadoPorNf: z.string().optional(),
  encerradoEm: z.string().optional(),
  encerradoPorNf: z.string().optional(),

  /** S6b/F6 — Alterações registradas após o início do serviço (timestamp). */
  alteracoesDiversas: z.array(alteracaoDiversaSchema).default([]),

  /** Nome do XLSX-fonte da escala, se houver. */
  origemEscala: z.string().nullable(),
  /** ISO timestamp de quando a Prévia foi gerada. */
  geradoEm: z.string(),
});
export type PreviaDoDia = z.infer<typeof previaDoDiaSchema>;

/**
 * Helper público (usado por backend e testes): chave normalizada de matching nome→NF.
 * Combina posto abreviado (sem espaços, sem ordinais) e nomeGuerra (uppercase, sem acentos).
 */
export function previaMatchKey(postoAbreviado: string, nomeGuerra: string): string {
  const postoNorm = postoAbreviado.toUpperCase().replace(/[ºª°]/g, '').replace(/\s+/g, '');
  const nomeNorm = nomeGuerra
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return `${postoNorm}|${nomeNorm}`;
}

/**
 * S6i — Gera texto institucional do Fiscal atestando IDEO.
 *
 * Caso A (todos realizados, sem alterações nos materiais):
 *   "Eu, <posto> <nome>, NF <nf>, atesto que todos os equipamentos
 *    inspecionados estão em ESTADO DE PRONTIDÃO (condições de pronto emprego)"
 *
 * Caso B (algum não realizado): texto descritivo listando os tipos não
 * realizados e seus motivos. Caller decide se inclui no payload da PD.
 *
 * Retorna `null` se faltar marcação de algum tipo (incompleto).
 */
export function gerarTextoFiscalAtestadoIdeo(
  ideoStatus: readonly { tipo: TipoIdeo; realizada: boolean; motivoNaoRealizacao?: string }[],
  fiscal: { posto: string; nomeGuerra: string; nf: string } | null,
): string | null {
  if (!fiscal) return null;
  const tiposEsperados: readonly TipoIdeo[] = ['ABTS', 'RESGATE'];
  const tiposMarcados = new Set(ideoStatus.map((s) => s.tipo));
  const completo = tiposEsperados.every((t) => tiposMarcados.has(t));
  if (!completo) return null;

  const naoRealizadas = ideoStatus.filter((s) => !s.realizada);
  if (naoRealizadas.length === 0) {
    return `Eu, ${fiscal.posto} ${fiscal.nomeGuerra}, NF ${fiscal.nf}, atesto que todos os equipamentos inspecionados estão em ESTADO DE PRONTIDÃO (condições de pronto emprego)`;
  }
  const detalhes = naoRealizadas
    .map((s) => `IDEO ${s.tipo} NÃO REALIZADA — ${s.motivoNaoRealizacao ?? 'sem motivo informado'}`)
    .join('; ');
  return `Eu, ${fiscal.posto} ${fiscal.nomeGuerra}, NF ${fiscal.nf}, registro: ${detalhes}.`;
}

/** Re-exports tipados para conveniência. */
export type { LetraEquipe, MilitarRef, Militar, TipoIdeo };

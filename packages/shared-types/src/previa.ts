import { z } from 'zod';
import { LETRA_EQUIPE, type LetraEquipe } from './escala.js';
import { TIPO_IDEO, type TipoIdeo } from './ideo.js';
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

/** Substituição pontual de militar (S5/F7a). */
export const previaTrocaSchema = z.object({
  substituidoNf: z.string().optional(),
  substituidoRaw: z.string(),
  substitutoNf: z.string().optional(),
  substitutoRaw: z.string(),
  /** Texto livre — ex.: "24h", "Matutino", "13:10 às 19:10". */
  periodo: z.string(),
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

/** Dispensa do dia (S5/F7a). */
export const previaDispensaSchema = z.object({
  militarRaw: z.string(),
  militarNf: z.string().optional(),
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

/** Re-exports tipados para conveniência. */
export type { LetraEquipe, MilitarRef, Militar, TipoIdeo };

import { z } from 'zod';
import { LETRA_EQUIPE, type LetraEquipe } from './escala.js';
import { TIPO_IDEO, type TipoIdeo } from './ideo.js';
import { militarSchema, type Militar } from './militar.js';
import { militarRefSchema, type MilitarRef } from './escala.js';

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
 * Linha da tripulação na Prévia. Combina dados da escala XLSX (raw, posto, nomeGuerra)
 * com a resolução pelo QDI (nf, ant, situacao). Quando não resolve, `militarResolvido`
 * fica `null` e uma inconsistência `NF_NAO_RESOLVIDO` é registrada.
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

  /** Composição (viatura × função × militar) da equipe escalada. */
  tripulacao: z.array(previaTripulacaoEntrySchema),

  /** Itens IDEO do dia, agrupados por tipo de viatura. */
  ideo: z.array(previaIdeoEntrySchema),

  /** Viaturas operacionais (ativas) da Companhia, com nome canônico. */
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

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
    }),
  ),

  inconsistencias: z.array(previaInconsistenciaSchema),

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

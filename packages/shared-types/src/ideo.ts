import { z } from 'zod';

/**
 * Tabela IDEO (Itens Diários de Entrega Operacional) — rotativa por dia do mês.
 *
 * Para cada dia (1-31) e tipo de viatura (ABTS/RESGATE), há uma lista de itens
 * que devem estar presentes na conferência diária.
 *
 * Originalmente mantida em Google Sites (PRD §1.6); o ARGUS agora hospeda como
 * cadastro mestre. RF-CM-115 do PRD v2.0 — promovido para [MUST] em S2.5.
 */
export const TIPO_IDEO = ['ABTS', 'RESGATE'] as const;
export type TipoIdeo = (typeof TIPO_IDEO)[number];

export const ideoEntrySchema = z.object({
  /** Dia do mês (1-31). */
  dia: z.number().int().min(1).max(31),
  /** Tipo de viatura. */
  tipo: z.enum(TIPO_IDEO),
  /** Itens IDEO do dia (formato livre — ex.: "Mochila Costal", "GPS", "Oxigênio", "Aspirador"). */
  itens: z.array(z.string()),
  atualizadoEm: z.string(),
  atualizadoPorNf: z.string().optional(),
});
export type IdeoEntry = z.infer<typeof ideoEntrySchema>;

export const upsertIdeoEntryInputSchema = z.object({
  dia: z.number().int().min(1).max(31),
  tipo: z.enum(TIPO_IDEO),
  itens: z.array(z.string().trim().min(1)).max(20),
});
export type UpsertIdeoEntryInput = z.infer<typeof upsertIdeoEntryInputSchema>;

/**
 * Resposta da listagem agrupada: matriz dia × tipo, otimizada para a tela do Admin.
 */
export const ideoMatrixSchema = z.object({
  /** Para cada dia (1-31) e tipo (ABTS/RESGATE), a lista de itens. Vazia se não cadastrada. */
  entries: z.array(ideoEntrySchema),
});
export type IdeoMatrix = z.infer<typeof ideoMatrixSchema>;

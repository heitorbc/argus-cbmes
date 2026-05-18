import { z } from 'zod';

/**
 * S2.10.6 — Conferência de Materiais (separada da Conferência da Viatura).
 *
 * Cadastro de compartimentos por contexto (viatura ou local). Realização
 * pode ser feita por qualquer militar escalado, podendo ocorrer depois do
 * preenchimento do MF CIODES (não bloqueia o início do serviço).
 */

/** Categorias de contexto suportadas. */
export const CONTEXTO_MATERIAL_TIPOS = ['viatura', 'local'] as const;
export type ContextoMaterialTipo = (typeof CONTEXTO_MATERIAL_TIPOS)[number];

/** Status individual de cada material conferido. */
export const STATUS_CONFERENCIA_MATERIAL = ['OK', 'AUSENTE', 'DANIFICADO'] as const;
export type StatusConferenciaMaterial = (typeof STATUS_CONFERENCIA_MATERIAL)[number];

export const STATUS_CONFERENCIA_MATERIAL_LABEL: Record<StatusConferenciaMaterial, string> = {
  OK: 'OK',
  AUSENTE: 'Ausente',
  DANIFICADO: 'Danificado',
};

export const compartimentoMaterialSchema = z.object({
  id: z.string(),
  contexto: z.string(), // ex.: 'viatura:ABTS_011' | 'local:SALA_FISCAL'
  contextoLabel: z.string(),
  compartimento: z.string(),
  materiais: z.array(z.string()),
  ordem: z.number().int().nonnegative(),
  ativo: z.boolean(),
  criadoEm: z.string(),
  atualizadoEm: z.string(),
});
export type CompartimentoMaterial = z.infer<typeof compartimentoMaterialSchema>;

export const createCompartimentoMaterialInputSchema = z.object({
  contexto: z.string().min(1),
  contextoLabel: z.string().min(1),
  compartimento: z.string().min(1),
  materiais: z.array(z.string().min(1)).min(1, 'Pelo menos 1 material'),
  ordem: z.number().int().nonnegative().optional(),
});
export type CreateCompartimentoMaterialInput = z.infer<
  typeof createCompartimentoMaterialInputSchema
>;

export const updateCompartimentoMaterialInputSchema = createCompartimentoMaterialInputSchema
  .partial()
  .extend({ ativo: z.boolean().optional() });
export type UpdateCompartimentoMaterialInput = z.infer<
  typeof updateCompartimentoMaterialInputSchema
>;

export const itemConferenciaMaterialV2Schema = z.object({
  compartimentoId: z.string(),
  material: z.string(),
  status: z.enum(STATUS_CONFERENCIA_MATERIAL),
  observacao: z.string().optional(),
});
export type ItemConferenciaMaterialV2 = z.infer<typeof itemConferenciaMaterialV2Schema>;

export const conferenciaMaterialV2Schema = z.object({
  id: z.string(),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  contexto: z.string(),
  realizadoPorNf: z.string(),
  realizadoEm: z.string(),
  itens: z.array(itemConferenciaMaterialV2Schema),
  observacao: z.string().optional(),
});
export type ConferenciaMaterialV2 = z.infer<typeof conferenciaMaterialV2Schema>;

export const registrarConferenciaMaterialInputSchema = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  contexto: z.string().min(1),
  itens: z.array(itemConferenciaMaterialV2Schema).min(1),
  observacao: z.string().optional(),
});
export type RegistrarConferenciaMaterialInput = z.infer<
  typeof registrarConferenciaMaterialInputSchema
>;

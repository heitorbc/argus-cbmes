import { z } from 'zod';

export const agendaFonteSchema = z.enum([
  'escala_mensal',
  'escala_especial',
  'nota_servico',
  'iseo_hospitais',
  'chefe_operacoes',
  'atestado',
  'dispensa',
  'ferias',
  'troca_autorizada',
]);
export type AgendaFonte = z.infer<typeof agendaFonteSchema>;

export const agendaItemSchema = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fonte: agendaFonteSchema,
  titulo: z.string(),
  subtitulo: z.string().optional(),
  horarioInicio: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  horarioFim: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  funcao: z.string().optional(),
  detalheUrl: z.string().optional(),
  /**
   * Identificador estável da entrada (ex.: NS123, ato#42). Útil para link
   * de detalhe e key de React. Não é exibido ao usuário.
   */
  id: z.string().optional(),
});
export type AgendaItem = z.infer<typeof agendaItemSchema>;

export const agendaConflitoSchema = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  itens: z.array(agendaItemSchema).min(2),
});
export type AgendaConflito = z.infer<typeof agendaConflitoSchema>;

export const agendaResponseSchema = z.object({
  proximoItem: agendaItemSchema.nullable(),
  itens: z.array(agendaItemSchema),
  conflitos: z.array(agendaConflitoSchema),
  geradoEm: z.string(),
});
export type AgendaResponse = z.infer<typeof agendaResponseSchema>;

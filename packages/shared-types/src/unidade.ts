import { z } from 'zod';

/**
 * Unidade institucional (1ª Cia/1º BBM, 2ª Cia/1º BBM, etc.).
 *
 * S6d — entidade introduzida para tornar configurável a relação Unidade → Recursos.
 * Fase 1: seed hardcoded só com 1ª1º. Sem CRUD UI ainda (S6e/S6f).
 *
 * Persistência in-memory (Fase 1); migra para Prisma+Supabase em S5b.
 */
export const unidadeSchema = z.object({
  id: z.string(),
  /** Código curto institucional (ex.: "1ª1º"). */
  codigo: z.string().min(1),
  /** Nome completo (ex.: "1ª Cia / 1º BBM"). */
  nome: z.string().min(1),
  /** Se false, recursos da unidade são ignorados em parsers/leituras. */
  ativo: z.boolean(),
  criadoEm: z.string(),
  atualizadoEm: z.string(),
});
export type Unidade = z.infer<typeof unidadeSchema>;

export const createUnidadeInputSchema = z.object({
  codigo: z.string().min(1, 'Código obrigatório'),
  nome: z.string().min(1, 'Nome obrigatório'),
  ativo: z.boolean().optional(),
});
export type CreateUnidadeInput = z.infer<typeof createUnidadeInputSchema>;

export const updateUnidadeInputSchema = z.object({
  codigo: z.string().min(1).optional(),
  nome: z.string().min(1).optional(),
  ativo: z.boolean().optional(),
});
export type UpdateUnidadeInput = z.infer<typeof updateUnidadeInputSchema>;

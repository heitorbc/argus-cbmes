import { z } from 'zod';

/**
 * Unidade institucional (1º BBM, 1ª Cia, PAB Baixo Guandu, etc.).
 *
 * S6d — entidade introduzida para tornar configurável a relação Unidade → Recursos.
 * S2.10.3 — migrada para Prisma+Supabase.
 * S2.13a — ganha `tipo` (batalhao | companhia | posto_avancado) +
 * `unidadePaiId` (auto-referência) para representar a hierarquia institucional.
 *
 * Sargenteante/Oficial de Operações de uma unidade vê própria unidade +
 * descendentes (companhia "abrange" postos avançados ligados a ela).
 */
export const TIPO_UNIDADE = ['batalhao', 'companhia', 'posto_avancado'] as const;
export type TipoUnidade = (typeof TIPO_UNIDADE)[number];

export const unidadeSchema = z.object({
  id: z.string(),
  /** Código curto institucional (ex.: "1ª1º", "3ªIND", "PAB-BG"). */
  codigo: z.string().min(1),
  /** Nome completo (ex.: "1ª Cia / 1º BBM", "PAB Baixo Guandu"). */
  nome: z.string().min(1),
  /** S2.13a — tipo institucional. */
  tipo: z.enum(TIPO_UNIDADE),
  /** S2.13a — unidade pai na hierarquia (NULL para topo, ex.: 1º BBM). */
  unidadePaiId: z.string().nullable(),
  /** Se false, recursos da unidade são ignorados em parsers/leituras. */
  ativo: z.boolean(),
  /** S2.13f — marca unidades criadas auto pelo consolidador (LOCAL desconhecido). */
  criacaoAutomatica: z.boolean(),
  criadoEm: z.string(),
  atualizadoEm: z.string(),
});
export type Unidade = z.infer<typeof unidadeSchema>;

export const createUnidadeInputSchema = z.object({
  codigo: z.string().min(1, 'Código obrigatório'),
  nome: z.string().min(1, 'Nome obrigatório'),
  /** S2.13a — default `companhia` aplicado no service quando omitido. */
  tipo: z.enum(TIPO_UNIDADE).optional(),
  unidadePaiId: z.string().nullable().optional(),
  ativo: z.boolean().optional(),
});
export type CreateUnidadeInput = z.infer<typeof createUnidadeInputSchema>;

export const updateUnidadeInputSchema = z.object({
  codigo: z.string().min(1).optional(),
  nome: z.string().min(1).optional(),
  tipo: z.enum(TIPO_UNIDADE).optional(),
  unidadePaiId: z.string().nullable().optional(),
  ativo: z.boolean().optional(),
});
export type UpdateUnidadeInput = z.infer<typeof updateUnidadeInputSchema>;

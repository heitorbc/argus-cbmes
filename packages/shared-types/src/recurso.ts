import { z } from 'zod';

/**
 * Categoria do Recurso — usada pelo PreviaService para decidir como tratar
 * a entrada na composição:
 *   - OPERACIONAL: viatura padrão da equipe rotativa A/B/C/D (parsed do XLSX da SOS)
 *   - STAFF: complemento fixo do MF (CHEFE DE OPERAÇÕES) — bucket "STAFF" na composição
 *   - AQUATICA: pelotão de aquáticas (MERGULHO/SALVAMAR/QUADRICICLO) — bucket "AQUATICAS"
 *   - GUARDA: serviço da guarda interna (não vai pra Prévia operacional)
 */
export const CATEGORIA_RECURSO = ['OPERACIONAL', 'STAFF', 'AQUATICA', 'GUARDA'] as const;
export type CategoriaRecurso = (typeof CATEGORIA_RECURSO)[number];

/**
 * Recurso institucional configurável da unidade.
 *
 * S6d — substitui a whitelist hardcoded `RECURSOS_VALIDOS` (parser MF) e
 * `RECURSOS_STAFF`/`RECURSOS_AQUATICAS` (previa.service) por entidade
 * persistida e configurável.
 *
 * Fase 1: seed hardcoded para 1ª1º (ABTS_01 ... GUARDA). Sem CRUD UI ainda.
 */
export const recursoSchema = z.object({
  id: z.string(),
  unidadeId: z.string(),
  /**
   * Nome canônico — DEVE casar exatamente com o texto da col A do MF
   * (ex.: "ABTS_01", "MERGULHO 01", "DRO / TELEFONISTA").
   */
  nome: z.string().min(1),
  categoria: z.enum(CATEGORIA_RECURSO),
  /** Se false, parser do MF ignora este recurso. */
  ativo: z.boolean(),
  /** Se true, espera prefixo de viatura e status na col B/C do MF. */
  comportaViatura: z.boolean(),
  /** Se true, espera militares (chefe/motorista/operadores) nas cols D-J do MF. */
  comportaEfetivo: z.boolean(),
  /** Ordem de exibição (espelha a ordem na planilha do MF). */
  ordem: z.number().int().nonnegative(),
  criadoEm: z.string(),
  atualizadoEm: z.string(),
});
export type Recurso = z.infer<typeof recursoSchema>;

export const createRecursoInputSchema = z.object({
  unidadeId: z.string().min(1, 'Unidade obrigatória'),
  nome: z.string().min(1, 'Nome obrigatório'),
  categoria: z.enum(CATEGORIA_RECURSO),
  ativo: z.boolean().optional(),
  comportaViatura: z.boolean(),
  comportaEfetivo: z.boolean(),
  ordem: z.number().int().nonnegative(),
});
export type CreateRecursoInput = z.infer<typeof createRecursoInputSchema>;

export const updateRecursoInputSchema = z.object({
  nome: z.string().min(1).optional(),
  categoria: z.enum(CATEGORIA_RECURSO).optional(),
  ativo: z.boolean().optional(),
  comportaViatura: z.boolean().optional(),
  comportaEfetivo: z.boolean().optional(),
  ordem: z.number().int().nonnegative().optional(),
});
export type UpdateRecursoInput = z.infer<typeof updateRecursoInputSchema>;

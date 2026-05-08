import { z } from 'zod';

/**
 * Fiscal de Serviço cadastrado explicitamente — sobrescreve o cálculo automático
 * (que escolhe o militar de menor ANT entre os escalados na equipe daquele dia).
 *
 * RF-CM-103 do PRD v2.0.
 */
export const fiscalCadastradoSchema = z.object({
  id: z.string().uuid(),
  /** NF do militar designado como Fiscal. */
  militarNf: z.string().min(1),
  /** Equipe à qual o cadastro se aplica (A/B/C/D). Se omitido, vale para qualquer equipe na vigência. */
  equipe: z.enum(['A', 'B', 'C', 'D']).optional(),
  /** Início da vigência (ISO date YYYY-MM-DD). */
  vigenciaInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Fim da vigência (inclusivo). Se omitido, sem data fim — vigente até nova decisão. */
  vigenciaFim: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  /** Motivo institucional (opcional). */
  motivo: z.string().optional(),
  criadoEm: z.string(),
  criadoPorNf: z.string(),
});
export type FiscalCadastrado = z.infer<typeof fiscalCadastradoSchema>;

export const createFiscalInputSchema = z.object({
  militarNf: z.string().min(1, 'NF do militar obrigatório'),
  equipe: z.enum(['A', 'B', 'C', 'D']).optional(),
  vigenciaInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD'),
  vigenciaFim: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD')
    .optional(),
  motivo: z.string().optional(),
});
export type CreateFiscalInput = z.infer<typeof createFiscalInputSchema>;

/** Resultado do cálculo do Fiscal vigente para uma equipe+data. */
export const fiscalVigenteSchema = z.object({
  /** O Militar designado como Fiscal. Pode vir de cadastro explícito ou cálculo padrão. */
  militarNf: z.string(),
  /** Origem: 'cadastrado' = vem de FiscalCadastrado; 'default' = cálculo automático (menor ANT). */
  origem: z.enum(['cadastrado', 'default']),
  /** Quando origem='cadastrado', referência ao registro. */
  fiscalId: z.string().uuid().optional(),
});
export type FiscalVigente = z.infer<typeof fiscalVigenteSchema>;

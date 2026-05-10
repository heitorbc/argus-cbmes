import { z } from 'zod';

/**
 * S6k — Atestado médico de um militar.
 *
 * Pode ser registrado em 3 lugares (todos apontam para a mesma entidade):
 *  1. Página `/cadastros/atestados` (Sargenteação).
 *  2. Ajuste pré-turno da Prévia (`<AtestadosFieldset>`).
 *  3. Durante o serviço — fluxo de Alterações Diversas (S6b/F6).
 *
 * Persistência in-memory (Fase 1) keyed por `id`. Em S5b vira tabela.
 */
export const atestadoSchema = z.object({
  id: z.string(),
  militarNf: z.string().min(1),
  /** Data ISO `YYYY-MM-DD` em que o atestado começa a vigorar. */
  dataInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Quantidade de dias (1-365). Inclui o dia de início. */
  dias: z.number().int().min(1).max(365),
  /** Código CID-10 (ex.: "J11", "S52.5"). Validação leve — formato variado. */
  cid10: z.string().min(1, 'CID-10 obrigatório'),
  /** CRM do médico responsável pelo atestado. */
  crmMedico: z.string().min(1, 'CRM do médico obrigatório'),
  observacoes: z.string().optional(),
  criadoEm: z.string(),
  criadoPorNf: z.string(),
});
export type Atestado = z.infer<typeof atestadoSchema>;

export const createAtestadoInputSchema = z.object({
  militarNf: z.string().min(1, 'Militar obrigatório'),
  dataInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data início no formato YYYY-MM-DD'),
  dias: z.number().int().min(1).max(365),
  cid10: z.string().trim().min(1, 'CID-10 obrigatório'),
  crmMedico: z.string().trim().min(1, 'CRM do médico obrigatório'),
  observacoes: z.string().trim().optional(),
});
export type CreateAtestadoInput = z.infer<typeof createAtestadoInputSchema>;

export const updateAtestadoInputSchema = z.object({
  dataInicio: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  dias: z.number().int().min(1).max(365).optional(),
  cid10: z.string().trim().min(1).optional(),
  crmMedico: z.string().trim().min(1).optional(),
  observacoes: z.string().trim().optional(),
});
export type UpdateAtestadoInput = z.infer<typeof updateAtestadoInputSchema>;

/**
 * Helper: retorna `true` se o atestado está ativo em uma data específica
 * (intervalo half-open `[dataInicio, dataInicio + dias)`).
 */
export function atestadoAtivoNoDia(
  a: Pick<Atestado, 'dataInicio' | 'dias'>,
  dataIso: string,
): boolean {
  const inicio = new Date(`${a.dataInicio}T00:00:00Z`).getTime();
  const fim = inicio + a.dias * 24 * 60 * 60 * 1000;
  const alvo = new Date(`${dataIso}T00:00:00Z`).getTime();
  return alvo >= inicio && alvo < fim;
}

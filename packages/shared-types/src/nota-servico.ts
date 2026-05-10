import { z } from 'zod';

/**
 * S6l — Nota de Serviço (NS) registrada para um dia operacional.
 *
 * Pode ser criada em 2 lugares (todas apontam para a mesma entidade):
 *  1. Página `/cadastros/notas-servico` (Sargenteação).
 *  2. Ajuste pré-turno da Prévia (`<NotasServicoFieldset>`).
 *
 * No futuro (S6m): import a partir de PDF dos arquivos
 * `data/Nota de Serviço/NSXXX - ...pdf`. Por enquanto só CRUD manual.
 *
 * Persistência in-memory (Fase 1) keyed por `id`. Em S5b vira tabela.
 */
const horaRegex = /^\d{2}:\d{2}$/;

export const notaServicoSchema = z.object({
  id: z.string(),
  /** Código curto (ex.: "NS077", "NS001"). Usado como identificador externo. */
  codigo: z.string().min(1),
  /** Descrição curta para título (ex.: "ISEO - Coleta leite materno"). */
  descricao: z.string().min(1),
  /** Data ISO `YYYY-MM-DD` do serviço. */
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Hora de início no formato HH:MM. */
  horaInicio: z.string().regex(horaRegex),
  /** Hora de término no formato HH:MM. */
  horaFim: z.string().regex(horaRegex),
  /** Prefixo da viatura utilizada (opcional — pode não envolver viatura). */
  viaturaPrefixo: z.string().optional(),
  /** NFs dos militares escalados na NS (1 ou mais). */
  militaresNfs: z.array(z.string()).min(1, 'Pelo menos 1 militar escalado'),
  observacoes: z.string().optional(),
  criadoEm: z.string(),
  criadoPorNf: z.string(),
});
export type NotaServico = z.infer<typeof notaServicoSchema>;

export const createNotaServicoInputSchema = z.object({
  codigo: z.string().trim().min(1, 'Código obrigatório'),
  descricao: z.string().trim().min(1, 'Descrição obrigatória'),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data no formato YYYY-MM-DD'),
  horaInicio: z.string().regex(horaRegex, 'Hora início no formato HH:MM'),
  horaFim: z.string().regex(horaRegex, 'Hora fim no formato HH:MM'),
  viaturaPrefixo: z.string().trim().optional(),
  militaresNfs: z.array(z.string().min(1)).min(1, 'Pelo menos 1 militar'),
  observacoes: z.string().trim().optional(),
});
export type CreateNotaServicoInput = z.infer<typeof createNotaServicoInputSchema>;

export const updateNotaServicoInputSchema = z.object({
  codigo: z.string().trim().min(1).optional(),
  descricao: z.string().trim().min(1).optional(),
  data: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  horaInicio: z.string().regex(horaRegex).optional(),
  horaFim: z.string().regex(horaRegex).optional(),
  viaturaPrefixo: z.string().trim().optional(),
  militaresNfs: z.array(z.string().min(1)).min(1).optional(),
  observacoes: z.string().trim().optional(),
});
export type UpdateNotaServicoInput = z.infer<typeof updateNotaServicoInputSchema>;

import { z } from 'zod';

/**
 * Item 4 — Cadastro de Férias do militar (Sargenteação).
 *
 * O militar tem direito a 30 dias de férias por ano. O Sargenteante
 * registra qual mês são as férias previstas. Por padrão começam no
 * dia 15 do mês previsto, mas o Sargenteante pode ajustar a data.
 *
 * Persistência in-memory (Fase 1). Em S5b vira tabela `ferias` com
 * índice por militarNf + ano.
 */
const dataIsoRegex = /^\d{4}-\d{2}-\d{2}$/;
const mesAnoRegex = /^\d{4}-\d{2}$/;

export const feriasSchema = z.object({
  id: z.string(),
  militarNf: z.string().min(1),
  /** Mês previsto no formato `YYYY-MM`. */
  mesAno: z.string().regex(mesAnoRegex),
  /** Data efetiva de início (default: dia 15 do mes). */
  dataInicio: z.string().regex(dataIsoRegex),
  /** Dias de férias gozadas (default: 30). */
  dias: z.number().int().min(1).max(60),
  observacoes: z.string().optional(),
  criadoEm: z.string(),
  criadoPorNf: z.string(),
});
export type Ferias = z.infer<typeof feriasSchema>;

export const createFeriasInputSchema = z.object({
  militarNf: z.string().trim().min(1, 'NF do militar obrigatória'),
  mesAno: z.string().regex(mesAnoRegex, 'Mês previsto no formato YYYY-MM'),
  /** Opcional — default = dia 15 do mês. */
  dataInicio: z.string().regex(dataIsoRegex).optional(),
  /** Opcional — default = 30. */
  dias: z.number().int().min(1).max(60).optional(),
  observacoes: z.string().trim().optional(),
});
export type CreateFeriasInput = z.infer<typeof createFeriasInputSchema>;

export const updateFeriasInputSchema = z.object({
  mesAno: z.string().regex(mesAnoRegex).optional(),
  dataInicio: z.string().regex(dataIsoRegex).optional(),
  dias: z.number().int().min(1).max(60).optional(),
  observacoes: z.string().trim().optional(),
});
export type UpdateFeriasInput = z.infer<typeof updateFeriasInputSchema>;

/** Calcula data de início default = dia 15 do mês previsto. */
export function dataInicioDefault(mesAno: string): string {
  return `${mesAno}-15`;
}

/** Helper: verifica se uma data ISO está dentro do período de férias. */
export function feriasAtivaNoDia(f: Ferias, dataIso: string): boolean {
  if (dataIso < f.dataInicio) return false;
  // dataFim = dataInicio + dias
  const fim = addDiasIso(f.dataInicio, f.dias - 1);
  return dataIso <= fim;
}

function addDiasIso(iso: string, dias: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  dt.setUTCDate(dt.getUTCDate() + dias);
  const yy = dt.getUTCFullYear();
  const mo = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mo}-${dd}`;
}

import { z } from 'zod';

/**
 * Item 2 — Dispensa lida da aba "Dispensas 2026" da planilha
 * "Efetivo - Dados Gerais".
 *
 * Layout 2D do CSV: 12 meses em grid 6 cols/mês (5 dados + 1 separador),
 * em 2-3 blocos verticais (jan/mar/mai → fev/abr/jun → ...). Parser
 * normaliza para uma lista plana.
 */
export const dispensaSheetSchema = z.object({
  /** Data ISO normalizada (assume ano da planilha quando só DD/MM). */
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Nome do militar (raw, como veio na planilha). */
  militarRaw: z.string(),
  /** Letra da equipe (A/B/C/D ou rótulo livre como "MERG", "SAT"). */
  equipe: z.string().optional(),
  /** Número do E-Docs (ex.: "2026-VJGXD3") ou indicador alternativo. */
  edocs: z.string().optional(),
  /** Número da minuta (livre). */
  minuta: z.string().optional(),
});
export type DispensaSheet = z.infer<typeof dispensaSheetSchema>;

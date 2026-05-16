import { z } from 'zod';
import { bloqueioReimportSchema } from './escala.js';

/**
 * Um ato de Escala Especial — atribuição pontual de um militar a um turno
 * específico em uma data, fora da rotação A/B/C/D normal.
 *
 * Origem: aba `Modelo Aviso - Especial` do XLSM `MM - ESCALA ESPECIAL 1ª CIA - MES.xlsm`,
 * cols MILITAR / HORÁRIO / DATA / FUNÇÃO.
 *
 * Em S6a só lemos o XLSM e exibimos. Em S6b a Escala Especial alimenta as
 * "Observações de serviço" do Mapa Força e o campo "Escala Especial" da Parte Diária.
 */
export const escalaEspecialAtoSchema = z.object({
  /** Data ISO `YYYY-MM-DD`. */
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Texto cru do XLSX (ex.: `"SGT MARIANE"`, `"CB IZACK GONÇALVES"`). */
  militarRaw: z.string(),
  /** NF resolvido posteriormente via NomeMatcher (em S6b). */
  militarNf: z.string().optional(),
  /** Horário em texto (ex.: `"07:10 ÀS 13:10"`). */
  horario: z.string(),
  /** Função/atribuição (ex.: `"APOIO"`, `"SENTINELA"`, `"FISCAL DE EVENTO"`). */
  funcao: z.string(),
});
export type EscalaEspecialAto = z.infer<typeof escalaEspecialAtoSchema>;

export const escalaEspecialMensalSchema = z.object({
  mes: z.number().int().min(1).max(12),
  ano: z.number().int().min(2024).max(2100),
  origemArquivo: z.string(),
  importadoEm: z.string(),
  importadoPorNf: z.string().optional(),
  atos: z.array(escalaEspecialAtoSchema),
  avisos: z.array(z.string()),
});
export type EscalaEspecialMensal = z.infer<typeof escalaEspecialMensalSchema>;

export const previewEscalaEspecialResponseSchema = z.object({
  escala: escalaEspecialMensalSchema,
  /** Total de atos descartados (XXX = turno vago). */
  descartados: z.number().int().nonnegative(),
  /** S2.3 — dias com Prévia/Serviço já iniciado (bloqueia confirm). */
  bloqueios: z.array(bloqueioReimportSchema).default([]),
});
export type PreviewEscalaEspecialResponse = z.infer<typeof previewEscalaEspecialResponseSchema>;

import { z } from 'zod';

/**
 * S2.6 — Status dashboard dos serviços externos do ARGUS CBMES.
 *
 * Cada serviço tem 1 entre 4 estados:
 * - `ok`: respondendo normalmente.
 * - `degraded`: respondendo mas com algum sinal de problema (cache stale,
 *   última sync com erro, etc.). UX continua funcional.
 * - `down`: não responde / falhas consecutivas. UX provavelmente afetada.
 * - `pending`: ainda não habilitado (ex.: Supabase antes de S2.9).
 */
export const healthEstadoSchema = z.enum(['ok', 'degraded', 'down', 'pending']);
export type HealthEstado = z.infer<typeof healthEstadoSchema>;

export const healthServicoSchema = z.object({
  estado: healthEstadoSchema,
  /** ISO timestamp da última sync bem-sucedida, se aplicável. */
  ultimaSyncEm: z.string().nullable().optional(),
  /** Detalhe humano-legível (mensagem de erro, info de cache, etc.). */
  detalhe: z.string().optional(),
});
export type HealthServico = z.infer<typeof healthServicoSchema>;

export const healthStatusSchema = z.object({
  /** API NestJS — sempre `ok` se este endpoint respondeu. */
  api: healthServicoSchema,
  /** Mapa Força CIODES (CSV público real-time, TTL adaptativo). */
  mapaForcaCiodes: healthServicoSchema,
  /**
   * Supabase / Postgres — S2.10.13a: check real via `prisma.$queryRaw`
   * com timeout. `degraded` em latência alta (>1s), `down` em falha,
   * `ok` em <1s.
   */
  supabase: healthServicoSchema,
  /** Timestamp do snapshot. */
  geradoEm: z.string(),
});
export type HealthStatus = z.infer<typeof healthStatusSchema>;

import { z } from 'zod';

/**
 * S0.5/PR2 — Metadados de uma integração externa (planilha Google Sheets
 * consumida pelo backend via CSV público / gviz).
 *
 * Exposto via GET /integracoes para a página de Configurações.
 */
export const STATUS_INTEGRACAO = ['ok', 'stale', 'erro', 'nunca'] as const;
export type StatusIntegracao = (typeof STATUS_INTEGRACAO)[number];

export const STATUS_INTEGRACAO_LABEL: Record<StatusIntegracao, string> = {
  ok: '✅ OK',
  stale: '⚠️ Stale',
  erro: '❌ Erro',
  nunca: '⚪ Nunca sincronizado',
};

export const integracaoStatusSchema = z.object({
  id: z.string(),
  nome: z.string(),
  descricao: z.string(),
  /** URL pública (no Google Drive) da planilha. */
  url: z.string(),
  /** ISO timestamp do último sync bem-sucedido, ou null. */
  ultimoSyncEm: z.string().nullable(),
  /** Quantidade de registros lidos no último sync. */
  qtdRegistros: z.number().int().min(0),
  status: z.enum(STATUS_INTEGRACAO),
  /**
   * S2.10.8a — Quando `true`, a fonte NÃO persiste em Postgres; lê em
   * tempo real (cache 5min). Exemplo: Mapa Força CIODES (alta frequência
   * de atualização direta na planilha).
   */
  realtimeOnly: z.boolean().default(false),
  /** S2.10.8a — Quando `true`, faz parte do scheduler central (cron + startup). */
  noScheduler: z.boolean().default(false),
});
export type IntegracaoStatus = z.infer<typeof integracaoStatusSchema>;

/**
 * S2.10.8a — Histórico de syncs (admin / auditoria).
 */
export const syncLogEntrySchema = z.object({
  id: z.string(),
  fonte: z.string(),
  status: z.enum(['success', 'partial', 'failed']),
  created: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  erros: z.array(z.string()),
  trigger: z.string(),
  duracaoMs: z.number().int().nonnegative(),
  iniciadoEm: z.string(),
  finalizadoEm: z.string(),
});
export type SyncLogEntry = z.infer<typeof syncLogEntrySchema>;

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
});
export type IntegracaoStatus = z.infer<typeof integracaoStatusSchema>;

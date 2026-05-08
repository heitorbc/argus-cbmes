import { z } from 'zod';

/**
 * Militar lido da planilha de Efetivo do Sargenteante (somente leitura na Fase 1).
 * Apresentação sempre ordenada por ANT crescente (mais antigo primeiro).
 *
 * RF-CM-101 / RF-CM-102 do PRD v2.0.
 */
export const militarSchema = z.object({
  nf: z.string().min(1),
  ant: z.number().int().nonnegative(),
  posto: z.string().min(1),
  nome: z.string().min(1),
  /** Município de residência (não é lotação operacional). */
  municipio: z.string().optional(),
  /** Idade em anos completos. */
  idade: z.number().int().nonnegative().optional(),
  /** Tempo de serviço em anos. */
  servico: z.number().int().nonnegative().optional(),
  /** Situação funcional (ex.: "BCG31/2021", "REENGAJAMENTO"). */
  situacao: z.string().optional(),
});
export type Militar = z.infer<typeof militarSchema>;

export const efetivoListResponseSchema = z.object({
  items: z.array(militarSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  totalPages: z.number().int().min(1),
  /** ISO timestamp da última sincronização com a planilha. */
  syncedAt: z.string(),
  /** True se os dados são do último snapshot bem-sucedido (sync atual falhou). */
  stale: z.boolean(),
});
export type EfetivoListResponse = z.infer<typeof efetivoListResponseSchema>;

export const efetivoQuerySchema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type EfetivoQuery = z.infer<typeof efetivoQuerySchema>;

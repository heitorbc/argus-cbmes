import { z } from 'zod';

/**
 * Item 1 — Trocas Autorizadas (planilha externa de gestão).
 *
 * Cada linha representa **uma troca autorizada** envolvendo 2 datas:
 *   - Em `dataEscala`: o `substituto` assume no lugar do `escalado`.
 *   - Em `dataPagamento` ("pagamento da troca"): o `escalado` assume no
 *     lugar do `substituto` (papéis invertidos).
 *
 * Cada lado pode ter função e horário diferentes (ex.: SENTINELA 24h ↔
 * OPERADOR/SOCORRISTA 24h). Coluna A "STATUS" da planilha é ignorada
 * na importação — apenas linhas com STATUS = AUTORIZADA são exportadas
 * pelo formulário institucional.
 *
 * Fonte:
 *   `https://docs.google.com/spreadsheets/d/1IjD4XskscfL5w4bCw5lP5qTNIZi5307XJKc3yGWK4D8`
 */
export const trocaAutorizadaSchema = z.object({
  /** Identificador único interno (sequencial vindo do hash do registro). */
  id: z.string(),
  /** Carimbo de data/hora do registro (formato livre vindo da planilha). */
  registradoEm: z.string(),
  emailRegistrante: z.string().optional(),

  /** Lado 1: data em que `substituto` assume. */
  dataEscala: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  escaladoOriginal: z.string(),
  substituto: z.string(),
  funcao: z.string(),
  horario: z.string(),

  /** Lado 2: data em que `escaladoOriginal` "paga" a troca. */
  dataPagamento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  escaladoPagamento: z.string(),
  substitutoPagamento: z.string(),
  funcaoPagamento: z.string(),
  horarioPagamento: z.string(),

  isDobra48h: z.boolean(),
  numeroEdocs: z.string().optional(),
  numeroRegistro: z.string().optional(),
});
export type TrocaAutorizada = z.infer<typeof trocaAutorizadaSchema>;

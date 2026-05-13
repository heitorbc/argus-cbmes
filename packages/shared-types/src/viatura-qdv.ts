import { z } from 'zod';

/**
 * Item 3 — Viatura lida da planilha QDV (aba `1BBM_1CIA`).
 *
 * Campos selecionados (do total de ~21 no XLSX) que são relevantes para
 * o ARGUS. Demais campos (cartão de abastecimento, chassi, renavam, etc.)
 * ficam no `extras: Record<string,string>` opcional para inspeção sem
 * exigir mudança de schema.
 */
export const viaturaQdvSchema = z.object({
  prefixo: z.string().min(1),
  status: z.string().optional(), // "DISPONÍVEL" | "BAIXADA" | "EMPRESTADA" (label da planilha)
  emprestadaA: z.string().optional(),
  kmAtual: z.number().int().optional(),
  observacao: z.string().optional(),
  empregoPrimario: z.string().optional(),
  empregoSecundario: z.string().optional(),
  placa: z.string().optional(),
  marcaModelo: z.string().optional(),
  combustivel: z.string().optional(),
  obm: z.string().optional(),
});
export type ViaturaQdv = z.infer<typeof viaturaQdvSchema>;

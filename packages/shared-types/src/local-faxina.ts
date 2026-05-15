import { z } from 'zod';

/**
 * Local de Faxina — entry de cadastro mestre dos locais que aparecem na
 * "Escala de Faxina" da Parte Diária.
 *
 * CRUD admin em `/cadastros/locais-faxina`. Bootstrap dev pré-cria os
 * 9 locais default informados pelo Tech Lead (RECOLHIMENTO DO LIXO,
 * ALOJ. MASC. ST/SGT, CASSINO, CORREDOR E ESCADA, COZINHA, ALOJ. E
 * BANHEIRO CB/SD, ALOJ. FEM. CB/SD, ALOJ. FEM. ST/SGT, ÁREA DA GUARDA).
 */
export const localFaxinaSchema = z.object({
  id: z.string(),
  nome: z.string().min(1),
  /** Ordem de exibição (asc); default próxima posição livre. */
  ordem: z.number().int().nonnegative().default(0),
  ativo: z.boolean().default(true),
  criadoEm: z.string(),
  atualizadoEm: z.string(),
});
export type LocalFaxina = z.infer<typeof localFaxinaSchema>;

export const createLocalFaxinaSchema = z.object({
  nome: z.string().min(1),
  ordem: z.number().int().nonnegative().optional(),
});
export type CreateLocalFaxinaInput = z.infer<typeof createLocalFaxinaSchema>;

export const updateLocalFaxinaSchema = z.object({
  nome: z.string().min(1).optional(),
  ordem: z.number().int().nonnegative().optional(),
  ativo: z.boolean().optional(),
});
export type UpdateLocalFaxinaInput = z.infer<typeof updateLocalFaxinaSchema>;

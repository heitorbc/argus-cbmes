import { z } from 'zod';

/**
 * Incidente do BAON (Boletim de Atendimento de Ocorrências Numeradas).
 *
 * Catálogo de códigos de classificação de ocorrência usado no preenchimento
 * de "Ocorrências Confeccionadas" e "Ocorrências Não Confeccionadas" da
 * Parte Diária.
 *
 * Fonte: `data/incidentes_BAON_CBMES.csv` (~512 entries) com colunas
 * `CODIGO;DESCRICAO;CLASSIFICACAO`. Carregado em memória pelo
 * `IncidentesBaonService` no startup.
 */
export const incidenteBaonSchema = z.object({
  /** Código alfanumérico (ex.: "Q01A01", "M01E", "R08"). */
  codigo: z.string().min(1),
  /** Descrição completa (ex.: "INCENDIO: EM RESIDENCIA: CONGLOMERADO ..."). */
  descricao: z.string().min(1),
  /** Classificação macro (ex.: "CRIMINAL", "PREVENCIONAL", "RESGATE"). */
  classificacao: z.string().optional(),
});
export type IncidenteBaon = z.infer<typeof incidenteBaonSchema>;

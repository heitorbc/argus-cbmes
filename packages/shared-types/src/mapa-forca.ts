import { z } from 'zod';

/** Situação possível de uma viatura na coluna C do Mapa Força. */
export const STATUS_VTR = ['DISPONIVEL', 'BAIXADA', 'EMPRESTADA', 'NAO_POSSUI'] as const;
export type StatusVtr = (typeof STATUS_VTR)[number];

export const STATUS_VTR_LABEL: Record<StatusVtr, string> = {
  DISPONIVEL: 'Disponível',
  BAIXADA: 'Baixada',
  EMPRESTADA: 'Emprestada',
  NAO_POSSUI: 'Não possui',
};

/**
 * Um Recurso da 1ª Cia conforme aparece na aba "1º BBM" do Mapa Força.
 * Ex.: ABTS_01 (com viatura ABTS_011 e tripulação Chefe/Mot/Op1-3),
 *      MERGULHO 02 (com viatura AM_002 e M1/M2/M3/M4), GUARDA (sem viatura, 3 sentinelas).
 */
export const recursoMapaForcaSchema = z.object({
  /** Nome canônico do recurso na col A. */
  recurso: z.string(),
  /** Prefixo da viatura na col B (pode ser vazio para GUARDA, OFICIAL DE DIA, etc.). */
  vtrPrefixo: z.string().optional(),
  /** Situação da viatura na col C (null se vazio na planilha). */
  vtrStatus: z.enum(STATUS_VTR).nullable(),
  /** Flag "VTR SEM EQUIPE" da col D. */
  semEquipe: z.boolean(),
  /** Texto cru do Chefe (col E) — não resolvido para NF nesta camada. */
  chefe: z.string().optional(),
  /** Motorista (col F). */
  motorista: z.string().optional(),
  /** Operadores (cols G-J), até 4. Para mergulho semanticamente são M1/M2/... */
  operadores: z.array(z.string()),
});
export type RecursoMapaForca = z.infer<typeof recursoMapaForcaSchema>;

export const mapaForcaSnapshotSchema = z.object({
  recursos: z.array(recursoMapaForcaSchema),
  /** ISO timestamp da última leitura bem-sucedida do CSV. */
  syncedAt: z.string(),
  /** True se servindo um snapshot anterior por falha na sincronização atual. */
  stale: z.boolean(),
  /** Fiscal de Serviço do dia conforme planilha (só na linha 5). */
  fiscalDoDia: z.string().optional(),
});
export type MapaForcaSnapshot = z.infer<typeof mapaForcaSnapshotSchema>;

import { z } from 'zod';

export const iseoHospitalUnidadeSchema = z.enum(['HPM', 'HIMABA']);
export type IseoHospitalUnidade = z.infer<typeof iseoHospitalUnidadeSchema>;

export const iseoHospitalTurnoSchema = z.enum(['Diurno', 'Noturno']);
export type IseoHospitalTurno = z.infer<typeof iseoHospitalTurnoSchema>;

export const iseoHospitalEntrySchema = z.object({
  unidade: iseoHospitalUnidadeSchema,
  posto: z.string().min(1),
  nome: z.string().min(1),
  nf: z.string().regex(/^\d+$/),
  dataIso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  turno: iseoHospitalTurnoSchema,
  funcao: z.string().optional(),
  contato: z.string().optional(),
  cargaHoraria: z.string().optional(),
  obm: z.string().optional(),
  lotacao: z.string().optional(),
});
export type IseoHospitalEntry = z.infer<typeof iseoHospitalEntrySchema>;

export const iseoHospitalSyncStatusSchema = z.object({
  unidade: iseoHospitalUnidadeSchema,
  syncedAt: z.string().nullable(),
  count: z.number().int().min(0),
  stale: z.boolean(),
});
export type IseoHospitalSyncStatus = z.infer<typeof iseoHospitalSyncStatusSchema>;

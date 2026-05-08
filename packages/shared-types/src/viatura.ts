import { z } from 'zod';

/**
 * Tipos de viatura da 1ª Cia/1º BBM.
 * Códigos vêm dos prefixos institucionais.
 */
export const TIPOS_VIATURA = ['ABTS', 'AR', 'ATB', 'AU', 'AM', 'AC', 'TE'] as const;
export type TipoViatura = (typeof TIPOS_VIATURA)[number];

/** Status operacional de uma viatura. */
export const STATUS_VIATURA = ['operacional', 'em_manutencao', 'baixada', 'reserva'] as const;
export type StatusViatura = (typeof STATUS_VIATURA)[number];

/** Funções que compõem uma viatura (algumas vêm vazias dependendo do tipo). */
export const FUNCOES_VIATURA = [
  'chefe',
  'motorista',
  'cov',
  'op1',
  'op2',
  'socorrista',
  'mergulhador',
  'sentinela',
] as const;
export type FuncaoViatura = (typeof FUNCOES_VIATURA)[number];

export const viaturaSchema = z.object({
  id: z.string().uuid(),
  prefixo: z.string().min(1),
  placa: z.string().optional(),
  tipo: z.enum(TIPOS_VIATURA),
  funcaoOperacional: z.string().optional(),
  anoModelo: z.string().optional(),
  status: z.enum(STATUS_VIATURA),
  composicaoFuncoes: z.array(z.enum(FUNCOES_VIATURA)).default([]),
  observacoes: z.string().optional(),
  criadoEm: z.string(),
  atualizadoEm: z.string(),
});
export type Viatura = z.infer<typeof viaturaSchema>;

export const createViaturaSchema = viaturaSchema
  .omit({ id: true, criadoEm: true, atualizadoEm: true })
  .extend({
    prefixo: z.string().regex(/^[A-Z]{2,4} \d{3}$/, 'Prefixo no formato "ABTS 011"'),
  });
export type CreateViaturaInput = z.infer<typeof createViaturaSchema>;

export const updateViaturaSchema = createViaturaSchema.partial();
export type UpdateViaturaInput = z.infer<typeof updateViaturaSchema>;

export const TIPO_VIATURA_LABEL: Record<TipoViatura, string> = {
  ABTS: 'Auto-Bomba Tanque-Salvamento',
  AR: 'Auto-Resgate',
  ATB: 'Auto-Tanque-Bomba',
  AU: 'Auto-Utilitário',
  AM: 'Auto-Embarcação (Mergulho)',
  AC: 'Auto-Salvamar (praia)',
  TE: 'Auto-Plataforma',
};

export const STATUS_VIATURA_LABEL: Record<StatusViatura, string> = {
  operacional: 'Operacional',
  em_manutencao: 'Em manutenção',
  baixada: 'Baixada',
  reserva: 'Reserva',
};

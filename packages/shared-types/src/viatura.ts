import { z } from 'zod';

/**
 * Tipos de viatura da 1ª Cia/1º BBM.
 * Códigos vêm dos prefixos institucionais.
 */
export const TIPOS_VIATURA = ['ABTS', 'AR', 'ATB', 'AU', 'AM', 'AC', 'TE'] as const;
export type TipoViatura = (typeof TIPOS_VIATURA)[number];

/**
 * Status de viatura — nomenclatura S6a/ADR-009 espelhando o Mapa Força (col C):
 * `VTR - DISPONIVEL`, `VTR - BAIXADA`, `VTR - EMPRESTADA`.
 */
export const STATUS_VIATURA = ['DISPONIVEL', 'BAIXADA', 'EMPRESTADA'] as const;
export type StatusViatura = (typeof STATUS_VIATURA)[number];

/** Origem do registro da viatura — define se é gerenciada pelo MF ou override admin. */
export const ORIGEM_VIATURA = ['mapa_forca', 'override_admin'] as const;
export type OrigemViatura = (typeof ORIGEM_VIATURA)[number];

/** Tipos de combustível suportados. */
export const TIPOS_COMBUSTIVEL = ['diesel', 'gasolina', 'eletrico', 'flex'] as const;
export type TipoCombustivel = (typeof TIPOS_COMBUSTIVEL)[number];

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
  id: z.string(),
  prefixo: z.string().min(1),
  placa: z.string().optional(),
  tipo: z.enum(TIPOS_VIATURA),
  funcaoOperacional: z.string().optional(),
  anoModelo: z.string().optional(),
  status: z.enum(STATUS_VIATURA),
  /**
   * `mapa_forca`: viatura espelhada do MF — status só pode mudar via Conferência (S6b).
   * `override_admin`: viatura criada/editada pelo admin — campos livres.
   */
  origem: z.enum(ORIGEM_VIATURA).default('override_admin'),
  composicaoFuncoes: z.array(z.enum(FUNCOES_VIATURA)).default([]),
  observacoes: z.string().optional(),

  // ---------- Campos novos (S6a) ---------- //
  /** Quilometragem atual (km). */
  kmAtual: z.number().int().nonnegative().optional(),
  tipoCombustivel: z.enum(TIPOS_COMBUSTIVEL).optional(),
  usaArla32: z.boolean().optional(),
  /** Capacidade do tanque em litros. */
  capacidadeTanqueLitros: z.number().nonnegative().optional(),
  /**
   * Estado do tanque em % (0-100). **Read-only** — preenchido na Conferência da Viatura (S6b).
   */
  estadoTanquePercent: z.number().min(0).max(100).optional(),
  alturaMetros: z.number().positive().optional(),
  larguraMetros: z.number().positive().optional(),
  /** NF do militar responsável (referência ao efetivo da 1ª Cia). */
  militarResponsavelNf: z.string().optional(),

  criadoEm: z.string(),
  atualizadoEm: z.string(),
});
export type Viatura = z.infer<typeof viaturaSchema>;

export const createViaturaSchema = viaturaSchema
  .omit({ id: true, criadoEm: true, atualizadoEm: true, origem: true, estadoTanquePercent: true })
  .extend({
    prefixo: z.string().regex(/^[A-Z]{2,4}[ _]\d{3}$/, 'Prefixo no formato "ABTS 011" ou "AM_002"'),
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
  DISPONIVEL: 'Disponível',
  BAIXADA: 'Baixada',
  EMPRESTADA: 'Emprestada',
};

export const TIPO_COMBUSTIVEL_LABEL: Record<TipoCombustivel, string> = {
  diesel: 'Diesel',
  gasolina: 'Gasolina',
  eletrico: 'Elétrico',
  flex: 'Flex (Etanol/Gasolina)',
};

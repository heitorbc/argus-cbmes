import { z } from 'zod';
import { STATUS_VIATURA } from './viatura.js';

/**
 * Estados do Serviço do dia (S6b).
 *
 * Transições válidas:
 *   NAO_INICIADO  → INICIADO  (Fiscal aperta "Iniciar Serviço")
 *   INICIADO      → EQUIPE_CONFERIDA  (todas presenças marcadas)
 *   EQUIPE_CONFERIDA → VIATURA_CONFERIDA  (todas viaturas conferidas)
 *   VIATURA_CONFERIDA → PREENCHENDO_MF  (Fiscal abre escrita do MF — S9)
 *   PREENCHENDO_MF → ENCERRADO  (escrita confirmada)
 *
 * Atalho permitido apenas para `admin`/`sargenteante`:
 *   {qualquer} → ENCERRADO  (override de emergência)
 */
export const ESTADO_SERVICO = [
  'NAO_INICIADO',
  'INICIADO',
  'EQUIPE_CONFERIDA',
  'VIATURA_CONFERIDA',
  'PREENCHENDO_MF',
  'ENCERRADO',
] as const;
export type EstadoServico = (typeof ESTADO_SERVICO)[number];

export const ESTADO_SERVICO_LABEL: Record<EstadoServico, string> = {
  NAO_INICIADO: 'Não iniciado',
  INICIADO: 'Iniciado',
  EQUIPE_CONFERIDA: 'Equipe conferida',
  VIATURA_CONFERIDA: 'Viaturas conferidas',
  PREENCHENDO_MF: 'Preenchendo MF',
  ENCERRADO: 'Encerrado',
};

export const servicoEstadoSchema = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  estado: z.enum(ESTADO_SERVICO),
  iniciadoEm: z.string().optional(),
  iniciadoPorNf: z.string().optional(),
  conferenciaEquipeEm: z.string().optional(),
  conferenciaViaturaEm: z.string().optional(),
  preenchendoMfEm: z.string().optional(),
  encerradoEm: z.string().optional(),
  encerradoPorNf: z.string().optional(),
});
export type ServicoEstado = z.infer<typeof servicoEstadoSchema>;

/** Status de presença de cada militar conferido pelo Chefe da Equipe (S6b/F3). */
export const STATUS_CONFERENCIA = ['pendente', 'presente', 'substituido', 'ausente'] as const;
export type StatusConferencia = (typeof STATUS_CONFERENCIA)[number];

export const STATUS_CONFERENCIA_LABEL: Record<StatusConferencia, string> = {
  pendente: 'Pendente',
  presente: 'Presente',
  substituido: 'Substituído',
  ausente: 'Ausente',
};

export const conferenciaEquipeEntrySchema = z.object({
  recurso: z.string(), // ex.: "ABTS_01"
  funcao: z.string(), // ex.: "Ch", "Mot", "Op1"
  militarOriginalNf: z.string(),
  statusConferencia: z.enum(STATUS_CONFERENCIA),
  substitutoNf: z.string().optional(),
  substitutoRaw: z.string().optional(),
  motivo: z.string().optional(),
  marcadoEm: z.string().optional(),
  marcadoPorNf: z.string().optional(),
});
export type ConferenciaEquipeEntry = z.infer<typeof conferenciaEquipeEntrySchema>;

/** Body do PUT /conferencia/equipe/:data — atualização em lote. */
export const upsertConferenciaEquipeSchema = z.object({
  entries: z.array(conferenciaEquipeEntrySchema.omit({ marcadoEm: true, marcadoPorNf: true })),
});
export type UpsertConferenciaEquipeInput = z.infer<typeof upsertConferenciaEquipeSchema>;

/** Conferência da Viatura — registrada pelo Motorista (S6b/F4). */
export const conferenciaViaturaEntrySchema = z.object({
  vtrPrefixo: z.string(),
  kmAtual: z.number().int().nonnegative().optional(),
  estadoTanquePercent: z.number().min(0).max(100),
  observacao: z.string().optional(),
  /** Mudança de status durante a conferência (raro; ex.: viatura quebrou). */
  statusMudanca: z.enum(STATUS_VIATURA).optional(),
  motivoBaixa: z.string().optional(),
  registradoEm: z.string().optional(),
  registradoPorNf: z.string().optional(),
});
export type ConferenciaViaturaEntry = z.infer<typeof conferenciaViaturaEntrySchema>;

export const upsertConferenciaViaturaSchema = conferenciaViaturaEntrySchema.omit({
  registradoEm: true,
  registradoPorNf: true,
});
export type UpsertConferenciaViaturaInput = z.infer<typeof upsertConferenciaViaturaSchema>;

/** Tipos de Alteração Diversa registradas durante o serviço (S6b/F6). */
export const TIPO_ALTERACAO_DIVERSA = ['troca_militar', 'mudanca_viatura', 'observacao'] as const;
export type TipoAlteracaoDiversa = (typeof TIPO_ALTERACAO_DIVERSA)[number];

export const alteracaoDiversaSchema = z.object({
  id: z.string(),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tipo: z.enum(TIPO_ALTERACAO_DIVERSA),
  recurso: z.string().optional(),
  funcao: z.string().optional(),
  militarOriginalNf: z.string().optional(),
  militarOriginalRaw: z.string().optional(),
  militarSubstitutoNf: z.string().optional(),
  militarSubstitutoRaw: z.string().optional(),
  vtrPrefixo: z.string().optional(),
  statusViaturaAnterior: z.enum(STATUS_VIATURA).optional(),
  statusViaturaNovo: z.enum(STATUS_VIATURA).optional(),
  motivo: z.string().optional(),
  observacao: z.string().optional(),
  registradoEm: z.string(),
  registradoPorNf: z.string(),
});
export type AlteracaoDiversa = z.infer<typeof alteracaoDiversaSchema>;

export const addAlteracaoDiversaSchema = alteracaoDiversaSchema.omit({
  id: true,
  data: true,
  registradoEm: true,
  registradoPorNf: true,
});
export type AddAlteracaoDiversaInput = z.infer<typeof addAlteracaoDiversaSchema>;

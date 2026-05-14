import { z } from 'zod';
import { STATUS_VIATURA } from './viatura.js';

/**
 * Estados do Serviço do dia (S6b + S0.x/rename-mapa-forca).
 *
 * Transições válidas:
 *   NAO_INICIADO  → PREVIA_INICIADA  (Fiscal escalado/admin abre a edição da Prévia)
 *   PREVIA_INICIADA → NAO_INICIADO  (cancelamento pelo iniciador ou admin)
 *   PREVIA_INICIADA → INICIADO  (Fiscal aperta "Iniciar Serviço" após ajustes)
 *   INICIADO      → EQUIPE_CONFERIDA  (todas presenças marcadas)
 *   EQUIPE_CONFERIDA → VIATURA_CONFERIDA  (todas viaturas conferidas)
 *   VIATURA_CONFERIDA → PREENCHENDO_MF  (Fiscal abre escrita do MF — S9)
 *   PREENCHENDO_MF → ENCERRADO  (escrita confirmada)
 *
 * Atalho permitido apenas para `admin`/`sargenteante`:
 *   {qualquer} → ENCERRADO  (override de emergência)
 *
 * A "Prévia do Mapa Força" designa exclusivamente o estado PREVIA_INICIADA —
 * o ato do Fiscal escalado revisar e editar os dados do dia (composição,
 * trocas, dispensas, ativações, etc.) antes do início do serviço.
 */
export const ESTADO_SERVICO = [
  'NAO_INICIADO',
  'PREVIA_INICIADA',
  'INICIADO',
  'EQUIPE_CONFERIDA',
  'VIATURA_CONFERIDA',
  'PREENCHENDO_MF',
  'ENCERRADO',
] as const;
export type EstadoServico = (typeof ESTADO_SERVICO)[number];

export const ESTADO_SERVICO_LABEL: Record<EstadoServico, string> = {
  NAO_INICIADO: 'Não iniciada',
  PREVIA_INICIADA: 'Em prévia',
  INICIADO: 'Serviço Iniciado',
  EQUIPE_CONFERIDA: 'Equipe conferida',
  VIATURA_CONFERIDA: 'Viaturas conferidas',
  PREENCHENDO_MF: 'Preenchendo Mapa Força',
  ENCERRADO: 'Encerrado (passagem de serviço)',
};

export const servicoEstadoSchema = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  estado: z.enum(ESTADO_SERVICO),
  previaIniciadaEm: z.string().optional(),
  previaIniciadaPorNf: z.string().optional(),
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

/**
 * Status agregado de conferência de uma equipe inteira (S6h/2.1).
 *
 * Calculado a partir dos `statusConferencia` individuais dos militares que
 * compõem a equipe (recurso). UI usa esse valor para colorir o card da equipe.
 *
 *   - `nao_conferida`: nenhum militar foi marcado ainda.
 *   - `em_conferencia`: pelo menos 1 militar marcado, mas faltam outros.
 *   - `conferida`: todos os militares marcados (presente/substituido/ausente).
 */
export const STATUS_CONFERENCIA_EQUIPE = ['nao_conferida', 'em_conferencia', 'conferida'] as const;
export type StatusConferenciaEquipe = (typeof STATUS_CONFERENCIA_EQUIPE)[number];

export const STATUS_CONFERENCIA_EQUIPE_LABEL: Record<StatusConferenciaEquipe, string> = {
  nao_conferida: 'Não conferida',
  em_conferencia: 'Em conferência',
  conferida: 'Conferida',
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

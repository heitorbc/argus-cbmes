import { z } from 'zod';

/**
 * Tabela IDEO (Itens Diários de Entrega Operacional) — rotativa por dia do mês.
 *
 * Para cada dia (1-31) e tipo de viatura (ABTS/RESGATE), há uma lista de itens
 * que devem estar presentes na conferência diária.
 *
 * Originalmente mantida em Google Sites (PRD §1.6); o ARGUS agora hospeda como
 * cadastro mestre. RF-CM-115 do PRD v2.0 — promovido para [MUST] em S2.5.
 */
export const TIPO_IDEO = ['ABTS', 'RESGATE'] as const;
export type TipoIdeo = (typeof TIPO_IDEO)[number];

export const ideoEntrySchema = z.object({
  /** Dia do mês (1-31). */
  dia: z.number().int().min(1).max(31),
  /** Tipo de viatura. */
  tipo: z.enum(TIPO_IDEO),
  /** Itens IDEO do dia (formato livre — ex.: "Mochila Costal", "GPS", "Oxigênio", "Aspirador"). */
  itens: z.array(z.string()),
  atualizadoEm: z.string(),
  atualizadoPorNf: z.string().optional(),
});
export type IdeoEntry = z.infer<typeof ideoEntrySchema>;

export const upsertIdeoEntryInputSchema = z.object({
  dia: z.number().int().min(1).max(31),
  tipo: z.enum(TIPO_IDEO),
  itens: z.array(z.string().trim().min(1)).max(20),
});
export type UpsertIdeoEntryInput = z.infer<typeof upsertIdeoEntryInputSchema>;

/**
 * Resposta da listagem agrupada: matriz dia × tipo, otimizada para a tela do Admin.
 */
export const ideoMatrixSchema = z.object({
  /** Para cada dia (1-31) e tipo (ABTS/RESGATE), a lista de itens. Vazia se não cadastrada. */
  entries: z.array(ideoEntrySchema),
});
export type IdeoMatrix = z.infer<typeof ideoMatrixSchema>;

/**
 * Marcação de realização de um item IDEO num dia/tipo específico (S5/F6c).
 *
 * Usada na Conferência da Equipe (S6) e impressa na Parte Diária (S10/S11).
 * Em S5 só temos o backend; a UI fica para S6.
 */
export const ideoChecklistEntrySchema = z.object({
  /** Data ISO `YYYY-MM-DD` (não apenas `dia`, pois mesma data pode ter múltiplas equipes ao longo de meses). */
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tipo: z.enum(TIPO_IDEO),
  /** Texto do item (mesmo da lista do IdeoEntry para o dia equivalente). */
  item: z.string().min(1),
  realizado: z.boolean(),
  marcadoPorNf: z.string().optional(),
  marcadoEm: z.string().optional(),
});
export type IdeoChecklistEntry = z.infer<typeof ideoChecklistEntrySchema>;

export const markIdeoChecklistInputSchema = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tipo: z.enum(TIPO_IDEO),
  item: z.string().min(1),
  realizado: z.boolean(),
});
export type MarkIdeoChecklistInput = z.infer<typeof markIdeoChecklistInputSchema>;

/**
 * S0.x — 4 estados da IDEO (substitui o boolean `realizada`).
 *
 *  - `PENDENTE`: nenhum acesso do Chefe ainda.
 *  - `REALIZADA_SEM_ALTERACAO`: tudo em ordem (texto institucional padrão).
 *  - `REALIZADA_COM_ALTERACAO`: equipamentos com problema descritos
 *    individualmente em `equipamentos[]`.
 *  - `NAO_REALIZADA`: motivo geral em `motivoNaoRealizacao`.
 */
export const ESTADO_IDEO = [
  'PENDENTE',
  'REALIZADA_SEM_ALTERACAO',
  'REALIZADA_COM_ALTERACAO',
  'NAO_REALIZADA',
] as const;
export type EstadoIdeo = (typeof ESTADO_IDEO)[number];

export const ESTADO_IDEO_LABEL: Record<EstadoIdeo, string> = {
  PENDENTE: 'Pendente',
  REALIZADA_SEM_ALTERACAO: 'Realizada sem alteração',
  REALIZADA_COM_ALTERACAO: 'Realizada com alteração',
  NAO_REALIZADA: 'Não realizada',
};

/**
 * S0.x — Equipamento individual da IDEO com flag de alteração + descrição.
 * Usado quando o Chefe atesta `REALIZADA_COM_ALTERACAO` para listar quais
 * equipamentos previstos no IdeoEntry do dia apresentaram problemas.
 */
export const ideoEquipamentoAlteracaoSchema = z.object({
  /** Texto do equipamento (mesmo da lista do `IdeoEntry.itens` daquele dia). */
  item: z.string().min(1),
  /** Descrição livre da alteração observada. */
  descricao: z.string().min(1),
});
export type IdeoEquipamentoAlteracao = z.infer<typeof ideoEquipamentoAlteracaoSchema>;

/**
 * S6i + S0.x — Status de realização da IDEO de cada tipo (ABTS/RESGATE) num dia.
 *
 * Persistido por (`data` + `tipo`). Atestado pelo Chefe escalado do recurso
 * ABTS (qualquer ABTS_xx) ou RESGATE (qualquer Resgate xx) — admin/fiscal
 * podem fazer override.
 *
 * Consumido por:
 *  - Tela `/servico/:data/ideo` (S6i): radio de estado + lista de itens.
 *  - MapaForcaService.getMapaForcaDoDia: campo `ideoStatus[]` no payload.
 *  - Helper `gerarTextoFiscalAtestadoIdeo()`: gera texto institucional para a PD.
 */
export const ideoStatusDoDiaSchema = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tipo: z.enum(TIPO_IDEO),
  estado: z.enum(ESTADO_IDEO).default('PENDENTE'),
  /** Quando estado === REALIZADA_COM_ALTERACAO: lista equipamentos com alteração. */
  equipamentos: z.array(ideoEquipamentoAlteracaoSchema).default([]),
  /** Quando estado === NAO_REALIZADA: motivo geral da não-realização. */
  motivoNaoRealizacao: z.string().optional(),
  /** NF do Chefe (ou Fiscal/Admin override) que atestou. */
  atestadoPorNf: z.string(),
  geradoEm: z.string(),
});
export type IdeoStatusDoDia = z.infer<typeof ideoStatusDoDiaSchema>;

export const upsertIdeoStatusInputSchema = z
  .object({
    tipo: z.enum(TIPO_IDEO),
    estado: z.enum(ESTADO_IDEO),
    equipamentos: z.array(ideoEquipamentoAlteracaoSchema).optional(),
    motivoNaoRealizacao: z.string().trim().optional(),
  })
  .refine(
    (d) =>
      d.estado !== 'NAO_REALIZADA' || (d.motivoNaoRealizacao && d.motivoNaoRealizacao.length > 0),
    {
      message: 'Motivo é obrigatório quando IDEO não foi realizada',
      path: ['motivoNaoRealizacao'],
    },
  )
  .refine(
    (d) => d.estado !== 'REALIZADA_COM_ALTERACAO' || (d.equipamentos && d.equipamentos.length > 0),
    {
      message:
        'Quando estado é "Realizada com alteração", informe pelo menos 1 equipamento com descrição.',
      path: ['equipamentos'],
    },
  );
export type UpsertIdeoStatusInput = z.infer<typeof upsertIdeoStatusInputSchema>;

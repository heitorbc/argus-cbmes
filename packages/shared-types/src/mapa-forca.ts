import { z } from 'zod';
import { LETRA_EQUIPE, type LetraEquipe } from './escala.js';
import { TIPO_DISPENSA } from './dispensa.js';
import { ideoStatusDoDiaSchema, TIPO_IDEO, type TipoIdeo } from './ideo.js';
import { militarSchema, type Militar } from './militar.js';
import { militarRefSchema, type MilitarRef } from './escala.js';
import { alteracaoDiversaSchema, ESTADO_SERVICO, STATUS_CONFERENCIA } from './servico.js';
import { STATUS_VIATURA } from './viatura.js';

/** Tipos de inconsistência detectados na geração da Prévia. */
export const TIPO_INCONSISTENCIA = [
  'SEM_ESCALA_NO_MES',
  'EQUIPE_NAO_ESCALADA_NO_DIA',
  'NF_NAO_RESOLVIDO',
  'AMBIGUIDADE_NOME',
  'FISCAL_SEM_NF_RESOLVIDO',
  'IDEO_NAO_CADASTRADO',
  'VIATURA_DESCONHECIDA',
  'TROCAS_AUTORIZADAS_INDISPONIVEIS',
] as const;
export type TipoInconsistencia = (typeof TIPO_INCONSISTENCIA)[number];

export const mapaForcaInconsistenciaSchema = z.object({
  tipo: z.enum(TIPO_INCONSISTENCIA),
  mensagem: z.string(),
  detalhe: z.record(z.unknown()).optional(),
});
export type MapaForcaInconsistencia = z.infer<typeof mapaForcaInconsistenciaSchema>;

/**
 * Linha da tripulação na Prévia (S4-S6a — DEPRECATED em S6b).
 *
 * Combina dados da escala XLSX (raw, posto, nomeGuerra) com a resolução pelo
 * QDI (nf, ant, situacao). Quando não resolve, `militarResolvido` fica `null`
 * e uma inconsistência `NF_NAO_RESOLVIDO` é registrada.
 *
 * **S6b:** substituído por `composicaoMfMilitarSchema` dentro de
 * `composicaoMfEntrySchema` (1 entrada por recurso do MF, com chefe + motorista
 * + operadores). Mantido aqui apenas para tipos legados.
 */
export const tripulacaoEntrySchema = z.object({
  equipe: z.enum(LETRA_EQUIPE),
  viatura: z.string(),
  funcao: z.string(),
  militarRef: militarRefSchema,
  militarResolvido: militarSchema.nullable(),
  /** Indica se este militar é o Fiscal de Serviço daquele dia. */
  isFiscal: z.boolean(),
});
export type TripulacaoEntry = z.infer<typeof tripulacaoEntrySchema>;

/**
 * Militar dentro da composição do MF (S6b/F2).
 *
 * Cada militar tem `statusConferencia` para ser marcado pelo Chefe da Equipe
 * durante a Conferência (S6b/F3).
 */
export const composicaoMfMilitarSchema = z.object({
  raw: z.string(),
  postoAbreviado: z.string(),
  nomeGuerra: z.string(),
  militarResolvido: militarSchema.nullable(),
  statusConferencia: z.enum(STATUS_CONFERENCIA).default('pendente'),
  substitutoNf: z.string().optional(),
  substitutoRaw: z.string().optional(),
  isFiscal: z.boolean().default(false),
});
export type ComposicaoMfMilitar = z.infer<typeof composicaoMfMilitarSchema>;

/**
 * Linha da composição do Mapa Força — espelha 1:1 a estrutura do MF.
 * Cada linha = 1 recurso (ex.: ABTS_01, MERGULHO 02) com chefe + motorista +
 * operadores. Substitui `tripulacao` + `viaturasOperacionais` (S6b/F2/ADR-011).
 */
export const composicaoMfEntrySchema = z.object({
  recurso: z.string(),
  vtrPrefixo: z.string().optional(),
  vtrStatus: z.enum(STATUS_VIATURA).nullable(),
  semEquipe: z.boolean().default(false),
  equipe: z.enum(LETRA_EQUIPE).nullable(),
  chefe: composicaoMfMilitarSchema.optional(),
  motorista: composicaoMfMilitarSchema.optional(),
  operadores: z.array(composicaoMfMilitarSchema).default([]),
});
export type ComposicaoMfEntry = z.infer<typeof composicaoMfEntrySchema>;

/** Fiscal de Serviço resolvido (cadastro override ou default por menor ANT). */
export const fiscalDoDiaSchema = z.object({
  militarNf: z.string(),
  militarResolvido: militarSchema.nullable(),
  origem: z.enum(['cadastrado', 'default']),
  fiscalId: z.string().optional(),
  motivo: z.string().optional(),
});
export type FiscalDoDia = z.infer<typeof fiscalDoDiaSchema>;

export const previaIdeoEntrySchema = z.object({
  tipo: z.enum(TIPO_IDEO),
  itens: z.array(z.string()),
});
export type PreviaIdeoEntry = z.infer<typeof previaIdeoEntrySchema>;

/**
 * Período da troca (S6h/1.1).
 *
 * 5 opções predefinidas com horários institucionais + opção `custom` para
 * casos pontuais (hora início e fim livres). Substitui o antigo texto livre.
 */
export const PERIODO_TROCA_PREDEFINIDO = [
  'TURNO_24H',
  'DIURNO_12H', // 07:10 às 19:10
  'NOTURNO_12H', // 19:10 às 07:10
  'MATUTINO_6H', // 07:10 às 13:10
  'VESPERTINO_6H', // 13:10 às 19:10
] as const;
export type PeriodoTrocaPredefinido = (typeof PERIODO_TROCA_PREDEFINIDO)[number];

export const PERIODO_TROCA_PREDEFINIDO_LABEL: Record<PeriodoTrocaPredefinido, string> = {
  TURNO_24H: '24h',
  DIURNO_12H: '12h diurnas (07:10 às 19:10)',
  NOTURNO_12H: '12h noturnas (19:10 às 07:10)',
  MATUTINO_6H: '6h matutinas (07:10 às 13:10)',
  VESPERTINO_6H: '6h vespertinas (13:10 às 19:10)',
};

const horaRegex = /^\d{2}:\d{2}$/;
export const periodoTrocaSchema = z.discriminatedUnion('tipo', [
  z.object({
    tipo: z.literal('predefinido'),
    valor: z.enum(PERIODO_TROCA_PREDEFINIDO),
  }),
  z.object({
    tipo: z.literal('custom'),
    horaInicio: z.string().regex(horaRegex, 'Hora início no formato HH:MM'),
    horaFim: z.string().regex(horaRegex, 'Hora fim no formato HH:MM'),
  }),
]);
export type PeriodoTroca = z.infer<typeof periodoTrocaSchema>;

/**
 * Substituição pontual de militar (S5/F7a).
 *
 * S6h/1.1 — Campo `periodo` migrou de string livre para `PeriodoTroca`
 * estruturado. Para compat com dados antigos, schema aceita ambos: string
 * legacy (será normalizada na leitura) ou o novo objeto.
 */
export const previaTrocaSchema = z.object({
  substituidoNf: z.string().optional(),
  substituidoRaw: z.string(),
  substitutoNf: z.string().optional(),
  substitutoRaw: z.string(),
  /** Período da troca — `string` é legacy (S5); novo formato é `PeriodoTroca` (S6h). */
  periodo: z.union([z.string(), periodoTrocaSchema]),
  motivo: z.string().optional(),
  /**
   * S0.5 — Quando `true`, a troca veio da planilha "Trocas Autorizadas"
   * integrada automaticamente pelo `PreviaService`. Frontend exibe badge
   * "Autorizada" para distinguir das trocas manuais (`ajustes.trocas`).
   */
  origemAutorizada: z.boolean().optional(),
  /** Função (opcional, vem das trocas autorizadas). */
  funcao: z.string().optional(),
  /** Nº E-Docs da autorização (opcional). */
  numeroEdocs: z.string().optional(),
});
export type PreviaTroca = z.infer<typeof previaTrocaSchema>;

/** Escala especial Matutino/Vespertino (S5/F7a). */
export const previaEscalaEspecialSchema = z.object({
  matutina: z.object({ militarRaw: z.string(), militarNf: z.string().optional() }).optional(),
  vespertina: z.object({ militarRaw: z.string(), militarNf: z.string().optional() }).optional(),
});
export type PreviaEscalaEspecial = z.infer<typeof previaEscalaEspecialSchema>;

/**
 * Item de Nota de Serviço aplicada ao dia (S5/F7a + S6l).
 *
 * S6l: agora derivado da entidade `NotaServico`. Inclui hora início/fim,
 * viatura, militares escalados (com nome formatado), observações.
 * Campos `notaServicoId` e novos opcionais para retrocompat com o schema
 * mínimo do S5 (`{codigo, descricao}` apenas).
 */
export const previaNotaServicoSchema = z.object({
  codigo: z.string(),
  descricao: z.string().optional(),
  /** S6l — ID da entidade NotaServico (preenchido quando vem do CRUD). */
  notaServicoId: z.string().optional(),
  horaInicio: z.string().optional(),
  horaFim: z.string().optional(),
  viaturaPrefixo: z.string().optional(),
  /** Lista enriquecida (NF + raw "POSTO NOMEGUERRA"). */
  militares: z
    .array(
      z.object({
        nf: z.string(),
        raw: z.string(),
      }),
    )
    .optional(),
  observacoes: z.string().optional(),
});
export type PreviaNotaServico = z.infer<typeof previaNotaServicoSchema>;

/**
 * Atestado médico ativo no dia, exibido na Prévia (S6k).
 *
 * Derivado da entidade `Atestado` (`@argus/shared-types/atestado`). Inclui
 * dados do militar (nome formatado) + período + CID-10 + CRM.
 */
export const previaAtestadoSchema = z.object({
  atestadoId: z.string(),
  militarNf: z.string(),
  militarRaw: z.string(),
  dataInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dias: z.number().int().min(1),
  cid10: z.string(),
  crmMedico: z.string(),
  observacoes: z.string().optional(),
});
export type PreviaAtestado = z.infer<typeof previaAtestadoSchema>;

/**
 * Dispensa do dia exibida na Prévia.
 *
 * S6j — agora derivado da entidade `Dispensa` (`@argus/shared-types/dispensa`).
 * Inclui tipo canônico, período e referência ao registro persistido. Campos
 * `motivo` (string livre, S5) preservados como deprecated p/ compat.
 */
export const previaDispensaSchema = z.object({
  militarRaw: z.string(),
  militarNf: z.string().optional(),
  /** S6j — tipo canônico (I_TAF..VIII_DIVERSAS). */
  tipo: z.enum(TIPO_DISPENSA).optional(),
  tipoLabel: z.string().optional(),
  dataInicio: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  dias: z.number().int().min(1).optional(),
  numeroEdocs: z.string().optional(),
  /** ID da entidade Dispensa (S6j). Quando preenchido, vem do `DispensasService`. */
  dispensaId: z.string().optional(),
  /** @deprecated S5 — usar `tipo` + `numeroEdocs` + `observacoes`. */
  motivo: z.string().optional(),
});
export type PreviaDispensa = z.infer<typeof previaDispensaSchema>;

/**
 * S0.5/4.1 — Férias ativas no dia da Prévia. Espelha o padrão de
 * `PreviaDispensa`, mas vem do módulo `FeriasService` (cadastro feito
 * pela Sargenteação) — não é uma dispensa institucional, é um período
 * de afastamento programado.
 */
export const previaFeriasSchema = z.object({
  feriasId: z.string(),
  militarNf: z.string(),
  /** Nome formatado do militar quando NF resolve no efetivo; senão `NF {nf}`. */
  militarRaw: z.string(),
  /** YYYY-MM do mês de férias programado. */
  mesAno: z.string().regex(/^\d{4}-\d{2}$/),
  /** Data ISO de início efetivo. */
  dataInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dias: z.number().int().min(1),
  observacoes: z.string().optional(),
});
export type PreviaFerias = z.infer<typeof previaFeriasSchema>;

/**
 * Ato leve da Escala Especial injetado read-only na Prévia (S6a-fix item 4).
 * Identificador único: combinação de `data + militarRaw + horario + funcao`.
 */
export const escalaEspecialAtoLightSchema = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  militarRaw: z.string(),
  horario: z.string(),
  funcao: z.string(),
});
export type EscalaEspecialAtoLight = z.infer<typeof escalaEspecialAtoLightSchema>;

/**
 * Troca de Escala Especial registrada pelo Fiscal (S6a-fix item 4).
 * Persiste em `MapaForcaDoDia.trocasEscalaEspecial`; será lida pela Parte Diária (S10/S11).
 */
export const trocaEscalaEspecialSchema = z.object({
  atoOriginal: escalaEspecialAtoLightSchema,
  substituidoNf: z.string().optional(),
  substituidoRaw: z.string(),
  substitutoNf: z.string().optional(),
  substitutoRaw: z.string(),
  registradoEm: z.string(),
  registradoPorNf: z.string(),
});
export type TrocaEscalaEspecial = z.infer<typeof trocaEscalaEspecialSchema>;

/** Chefe de Operações escalado num dia (S6a-fix item 6). Vem da planilha ChOp. */
export const chefeOperacoesSchema = z.object({
  posto: z.string(),
  nomeGuerra: z.string(),
  nf: z.string(),
  telefone: z.string().optional(),
  marcador: z.string().optional(),
});
export type ChefeOperacoes = z.infer<typeof chefeOperacoesSchema>;

/**
 * S0.x/Fix-AtivarRecurso — Permite ao Fiscal ativar um recurso do MF
 * que não estava na escala daquele dia, atribuindo viatura disponível
 * + Chefe (mínimo). Motorista e operadores são opcionais. Aplicado
 * pelo PreviaService antes do `buildComposicaoMf`.
 */
export const ativacaoRecursoSchema = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Nome canônico do recurso (ex.: 'RESGATE 02'). */
  recurso: z.string().min(1),
  vtrPrefixo: z.string().min(1),
  chefe: militarRefSchema,
  motorista: militarRefSchema.optional(),
  operadores: z.array(militarRefSchema).default([]),
  /** Equipe rotativa atribuída (default = equipe do dia). */
  equipe: z.enum(LETRA_EQUIPE).optional(),
});
export type AtivacaoRecurso = z.infer<typeof ativacaoRecursoSchema>;

/**
 * S0.x/Fix-Mergulho — Override do Fiscal: trocar a equipe que compõe
 * MERGULHO 01 com a que compõe MERGULHO 02 num dia específico.
 * Quando aplicado pelo `PreviaService`, equipe que estava em mergulho01
 * passa para mergulho02 e vice-versa.
 */
export const overrideMergulhoSchema = z.object({
  /** Data ISO (YYYY-MM-DD). */
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Sempre true; deixa o schema extensível para futuros tipos de override. */
  swap: z.literal(true),
});
export type OverrideMergulho = z.infer<typeof overrideMergulhoSchema>;

/**
 * Override do Fiscal para trocar a tripulação entre os pares 01/02 de
 * recursos operacionais quando a viatura nominal do XLSX está indisponível
 * no Mapa Força. Ex.: XLSX escala equipe em RESGATE 01 mas o MF mostra
 * RESGATE 01 baixada e RESGATE 02 com AR_031 DISPONIVEL — o Fiscal aciona
 * o swap e o `PreviaService` move a tripulação para RESGATE 02.
 *
 * Mergulho usa `overrideMergulhoSchema` próprio (semântica diferente:
 * letras A/B/C de equipes paralelas).
 */
export const PARES_RECURSOS = ['ABTS', 'RESGATE', 'SALVAMAR', 'QUADRICICLO'] as const;
export type ParRecurso = (typeof PARES_RECURSOS)[number];

export const overrideParRecursoSchema = z.object({
  /** Data ISO (YYYY-MM-DD). */
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  par: z.enum(PARES_RECURSOS),
  /** Sempre true; deixa schema extensível. */
  swap: z.literal(true),
});
export type OverrideParRecurso = z.infer<typeof overrideParRecursoSchema>;

/**
 * S0.5 — Swap de 2 militares de MESMA equipe entre posições da
 * tripulação na Prévia. Conveniência UX: o Fiscal troca papéis (ex.: chefe
 * ABTS_01 ↔ operador RESGATE_01, ambos CHARLIE) sem precisar abrir
 * uma "Troca de Serviço" institucional. Aplicado pelo `PreviaService`
 * sobre `tripulacao` e `composicaoMf` quando monta o payload.
 *
 * Validação: equipe igual em ambos os lados; ordem dos lados (A/B) é
 * indiferente — a operação é simétrica.
 */
export const previaSwapMilitarSchema = z.object({
  equipe: z.enum(LETRA_EQUIPE),
  viaturaA: z.string(),
  funcaoA: z.string(),
  viaturaB: z.string(),
  funcaoB: z.string(),
});
export type PreviaSwapMilitar = z.infer<typeof previaSwapMilitarSchema>;

/**
 * S0.x/fixes-3 — Override do Chefe de Operações por dia. O Fiscal escolhe
 * outro militar habilitado como ChOp (planilha externa) para substituir o
 * escalado. Aplicado pelo `MapaForcaService` antes da injeção do ChOp em
 * `tripulacao`. Modal dedicado lista apenas militares habilitados.
 */
export const overrideChefeOperacoesSchema = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** NF do novo Chefe de Operações (deve estar habilitado na planilha ChOp). */
  novoChefeNf: z.string().min(1),
});
export type OverrideChefeOperacoes = z.infer<typeof overrideChefeOperacoesSchema>;

/**
 * "Ajustes pré-turno" da Prévia — campos adicionais editáveis pelo Fiscal antes do
 * início do serviço. Persistidos em `AjustesPreviaService` (mock in-memory; S5b → Prisma).
 */
export const ajustesPreviaSchema = z.object({
  trocas: z.array(previaTrocaSchema),
  escalaEspecial: previaEscalaEspecialSchema,
  notasServico: z.array(previaNotaServicoSchema),
  dispensas: z.array(previaDispensaSchema),
  trocasEscalaEspecial: z.array(trocaEscalaEspecialSchema).default([]),
  swapsMilitares: z.array(previaSwapMilitarSchema).default([]),
  /** S0.x/Fix-Mergulho — Por dia, troca M01↔M02. */
  overridesMergulho: z.array(overrideMergulhoSchema).default([]),
  /** Por dia/par operacional, troca 01↔02 (ABTS, RESGATE, SALVAMAR, QUADRICICLO). */
  overridesParesRecursos: z.array(overrideParRecursoSchema).default([]),
  /** S0.x/Fix-AtivarRecurso — Recursos do MF ativados ad-hoc pelo Fiscal. */
  ativacoesRecurso: z.array(ativacaoRecursoSchema).default([]),
  /**
   * S0.x/fixes-3 — Override do Chefe de Operações por dia. Substitui o ChOp
   * escalado (vindo da planilha externa) por outro militar habilitado como
   * ChOp na mesma planilha. Modal dedicado na UI lista apenas habilitados.
   */
  overridesChefeOperacoes: z.array(overrideChefeOperacoesSchema).default([]),
});
export type AjustesPrevia = z.infer<typeof ajustesPreviaSchema>;

/** Body do PUT /previa/:data/ajustes — overwrite completo. */
export const upsertAjustesPreviaSchema = ajustesPreviaSchema;
export type UpsertAjustesPreviaInput = z.infer<typeof upsertAjustesPreviaSchema>;

/** Body do POST /previa/:data/ajustes/escala-especial/trocas. */
export const addTrocaEscalaEspecialSchema = z.object({
  atoOriginal: escalaEspecialAtoLightSchema,
  substituidoRaw: z.string().min(1),
  substituidoNf: z.string().optional(),
  substitutoRaw: z.string().min(1),
  substitutoNf: z.string().optional(),
});
export type AddTrocaEscalaEspecialInput = z.infer<typeof addTrocaEscalaEspecialSchema>;

export const mapaForcaDoDiaSchema = z.object({
  /** Data ISO `YYYY-MM-DD`. */
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ano: z.number().int(),
  mes: z.number().int(),
  dia: z.number().int(),

  /** Letra da equipe escalada (`null` se nenhum mês carregado para aquela data). */
  equipe: z.enum(LETRA_EQUIPE).nullable(),
  /** Nome institucional ("ALFA"/"BRAVO"/"CHARLIE"/"DELTA") quando equipe definida. */
  equipeNome: z.string().nullable(),

  fiscal: fiscalDoDiaSchema.nullable(),

  /**
   * S6b/F2 — Composição do MF (1 entrada por recurso, com chefe + motorista +
   * operadores). Espelha o shape do MF para preparar a escrita (S9). Substitui
   * `tripulacao` + `viaturasOperacionais` (mantidos como derivados pelo
   * PreviaService durante a transição).
   */
  composicaoMf: z.array(composicaoMfEntrySchema).default([]),

  /**
   * @deprecated em S6b — use `composicaoMf` que tem `statusConferencia` e shape
   * espelhado ao MF. `tripulacao` continua sendo derivado pelo PreviaService
   * para retrocompat com WhatsApp e tests legados.
   */
  tripulacao: z.array(tripulacaoEntrySchema),

  /** Itens IDEO do dia, agrupados por tipo de viatura. */
  ideo: z.array(previaIdeoEntrySchema),

  /**
   * S6i — Status de realização da IDEO por tipo (ABTS/RESGATE) no dia. Vazio
   * antes do Fiscal atestar. Quando completo (todos os tipos marcados),
   * `textoAtestadoIdeoFiscal` é gerado para a Parte Diária (S10/S11).
   */
  ideoStatus: z.array(ideoStatusDoDiaSchema).default([]),
  textoAtestadoIdeoFiscal: z.string().nullable().default(null),

  /**
   * @deprecated em S6b — use `composicaoMf[i].vtrPrefixo` + `vtrStatus`.
   * Derivado pelo PreviaService.
   */
  viaturasOperacionais: z.array(
    z.object({
      id: z.string(),
      codigo: z.string(),
      descricao: z.string(),
      vtrStatus: z.string().nullable().optional(),
    }),
  ),

  inconsistencias: z.array(mapaForcaInconsistenciaSchema),

  /** F7a — Ajustes pré-turno: trocas, escala especial, NS, dispensas. */
  trocas: z.array(previaTrocaSchema),
  escalaEspecial: previaEscalaEspecialSchema,
  notasServico: z.array(previaNotaServicoSchema),
  dispensas: z.array(previaDispensaSchema),
  /** S6k — atestados médicos ativos no dia (derivado de AtestadosService). */
  atestados: z.array(previaAtestadoSchema).default([]),
  /** S0.5/4.1 — Férias ativas no dia (derivado de FeriasService). */
  ferias: z.array(previaFeriasSchema).default([]),

  /** S6a-fix item 4 — atos da Escala Especial do dia (read-only) + trocas registradas. */
  escalaEspecialAtos: z.array(escalaEspecialAtoLightSchema).default([]),
  trocasEscalaEspecial: z.array(trocaEscalaEspecialSchema).default([]),

  /** S0.5 — Swaps de militares aplicados pelo Fiscal (UX troca entre posições da mesma equipe). */
  swapsMilitares: z.array(previaSwapMilitarSchema).default([]),

  /** S0.x/Fix-Mergulho — overrides M01↔M02 do Fiscal aplicados ao dia. */
  overridesMergulho: z.array(overrideMergulhoSchema).default([]),

  /** Overrides 01↔02 do Fiscal (ABTS/RESGATE/SALVAMAR/QUADRICICLO) aplicados ao dia. */
  overridesParesRecursos: z.array(overrideParRecursoSchema).default([]),

  /** S0.x/Fix-AtivarRecurso — Recursos do MF ativados ad-hoc pelo Fiscal. */
  ativacoesRecurso: z.array(ativacaoRecursoSchema).default([]),

  /** S0.x/fixes-3 — Overrides do Chefe de Operações por dia (modal dedicado). */
  overridesChefeOperacoes: z.array(overrideChefeOperacoesSchema).default([]),

  /**
   * Composição "atual" do turno corrente conforme o Mapa Força (col E-J da
   * aba 1ºBBM). Lê só o snapshot mais recente — não é histórico. O front
   * renderiza ao lado da tripulação do XLSX para o Fiscal comparar antes
   * da rendição.
   */
  composicaoAtualMf: z
    .array(
      z.object({
        recurso: z.string(),
        chefe: z.string().optional(),
        motorista: z.string().optional(),
        operadores: z.array(z.string()),
      }),
    )
    .default([]),

  /** S6a-fix item 6 — Chefes de Operações escalados no dia (planilha ChOp externa). */
  chefesOperacoes: z.array(chefeOperacoesSchema).default([]),

  /** S6b/F1 — Estado do Servico do dia (NAO_INICIADO → ENCERRADO). */
  estadoServico: z.enum(ESTADO_SERVICO).default('NAO_INICIADO'),
  /** S0.x/rename-mapa-forca — Quando o Fiscal/admin iniciou a Prévia (edição). */
  previaIniciadaEm: z.string().optional(),
  previaIniciadaPorNf: z.string().optional(),
  iniciadoEm: z.string().optional(),
  iniciadoPorNf: z.string().optional(),
  /** S0.x — Timestamp do último preenchimento do MF CIODES (mock). */
  mfPreenchidoEm: z.string().optional(),
  /** S0.x — Dirty state do MF CIODES (timestamp da 1ª alteração estrutural). */
  mfDirtyDesde: z.string().optional(),
  encerradoEm: z.string().optional(),
  encerradoPorNf: z.string().optional(),

  /** S6b/F6 — Alterações registradas após o início do serviço (timestamp). */
  alteracoesDiversas: z.array(alteracaoDiversaSchema).default([]),

  /** Nome do XLSX-fonte da escala, se houver. */
  origemEscala: z.string().nullable(),
  /** ISO timestamp de quando a Prévia foi gerada. */
  geradoEm: z.string(),
});
export type MapaForcaDoDia = z.infer<typeof mapaForcaDoDiaSchema>;

/**
 * Helper público (usado por backend e testes): chave normalizada de matching nome→NF.
 * Combina posto abreviado (sem espaços, sem ordinais) e nomeGuerra (uppercase, sem acentos).
 */
export function previaMatchKey(postoAbreviado: string, nomeGuerra: string): string {
  const postoNorm = postoAbreviado.toUpperCase().replace(/[ºª°]/g, '').replace(/\s+/g, '');
  const nomeNorm = nomeGuerra
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return `${postoNorm}|${nomeNorm}`;
}

/**
 * S6i + S0.x — Gera texto institucional atestando IDEO (Chefe ABTS/RESGATE).
 *
 * 4 estados por tipo (ABTS/RESGATE):
 *  - REALIZADA_SEM_ALTERACAO: estado de prontidão.
 *  - REALIZADA_COM_ALTERACAO: lista equipamentos com alteração.
 *  - NAO_REALIZADA: motivo geral.
 *  - PENDENTE: ainda não atestado (impede geração do texto consolidado).
 *
 * Caller decide se inclui no payload da Parte Diária. Retorna `null` se
 * faltar atestação de algum tipo (incompleto).
 */
export function gerarTextoFiscalAtestadoIdeo(
  ideoStatus: readonly {
    tipo: TipoIdeo;
    estado?: 'PENDENTE' | 'REALIZADA_SEM_ALTERACAO' | 'REALIZADA_COM_ALTERACAO' | 'NAO_REALIZADA';
    /** @deprecated S0.x — usar `estado`. Mantido para retrocompat. */
    realizada?: boolean;
    equipamentos?: readonly { item: string; descricao: string }[];
    motivoNaoRealizacao?: string;
  }[],
  fiscal: { posto: string; nomeGuerra: string; nf: string } | null,
): string | null {
  if (!fiscal) return null;
  const tiposEsperados: readonly TipoIdeo[] = ['ABTS', 'RESGATE'];

  // Mapa tipo → estado normalizado (compat: `realizada` legado vira
  // REALIZADA_SEM_ALTERACAO ou NAO_REALIZADA).
  const estadoPorTipo = new Map<
    TipoIdeo,
    {
      estado: 'PENDENTE' | 'REALIZADA_SEM_ALTERACAO' | 'REALIZADA_COM_ALTERACAO' | 'NAO_REALIZADA';
      equipamentos?: readonly { item: string; descricao: string }[];
      motivoNaoRealizacao?: string;
    }
  >();
  for (const s of ideoStatus) {
    const estadoNorm =
      s.estado ?? (s.realizada === true ? 'REALIZADA_SEM_ALTERACAO' : 'NAO_REALIZADA');
    estadoPorTipo.set(s.tipo, {
      estado: estadoNorm,
      equipamentos: s.equipamentos,
      motivoNaoRealizacao: s.motivoNaoRealizacao,
    });
  }
  const completo = tiposEsperados.every(
    (t) => estadoPorTipo.has(t) && estadoPorTipo.get(t)!.estado !== 'PENDENTE',
  );
  if (!completo) return null;

  const semAlteracoes = tiposEsperados.every(
    (t) => estadoPorTipo.get(t)!.estado === 'REALIZADA_SEM_ALTERACAO',
  );
  if (semAlteracoes) {
    return `Eu, ${fiscal.posto} ${fiscal.nomeGuerra}, NF ${fiscal.nf}, atesto que todos os equipamentos inspecionados estão em ESTADO DE PRONTIDÃO (condições de pronto emprego)`;
  }

  const detalhes = tiposEsperados
    .map((tipo) => {
      const s = estadoPorTipo.get(tipo)!;
      if (s.estado === 'REALIZADA_SEM_ALTERACAO') {
        return `IDEO ${tipo} REALIZADA SEM ALTERAÇÃO`;
      }
      if (s.estado === 'NAO_REALIZADA') {
        return `IDEO ${tipo} NÃO REALIZADA — ${s.motivoNaoRealizacao ?? 'sem motivo informado'}`;
      }
      // REALIZADA_COM_ALTERACAO: lista cada equipamento com a descrição.
      const itens = (s.equipamentos ?? [])
        .map((eq) => `${eq.item}: ${eq.descricao}`)
        .join('; ');
      return `IDEO ${tipo} REALIZADA COM ALTERAÇÃO — ${itens || 'sem detalhamento'}`;
    })
    .join('; ');
  return `Eu, ${fiscal.posto} ${fiscal.nomeGuerra}, NF ${fiscal.nf}, registro: ${detalhes}.`;
}

/** Re-exports tipados para conveniência. */
export type { LetraEquipe, MilitarRef, Militar, TipoIdeo };

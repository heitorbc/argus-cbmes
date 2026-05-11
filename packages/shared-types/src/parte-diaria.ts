import { z } from 'zod';
import { LETRA_EQUIPE } from './escala.js';
import { STATUS_VIATURA } from './viatura.js';

/**
 * S10 — Parte Diária (PD) da 1ª Cia/1º BBM.
 *
 * Documento institucional que o Fiscal de Serviço emite ao final do turno
 * relatando todas as ocorrências, escalas, alterações e passagens do dia.
 *
 * O backend monta um **rascunho** (`gerarRascunho(data)`) derivando de:
 *  - Prévia (composicaoMf, fiscal, dispensas, atestados, NS, ideoStatus)
 *  - Servico (alteracoes diversas)
 *  - AjustesPrevia (trocas, escala especial)
 *
 * O Fiscal sobrescreve campos editáveis via `salvar(data, override)`. O
 * endpoint `GET` retorna `merge(rascunho, override)` — sempre o estado mais
 * recente. Persistência in-memory (Fase 1); migra para Prisma em S5b.
 *
 * Referência canônica: `data/Fase1/2026.05.04_-_1ªCIA_1BBM.pdf`.
 */

const dataIsoRegex = /^\d{4}-\d{2}-\d{2}$/;

/** Identificação curta de militar usada em várias seções da PD. */
export const parteDiariaMilitarRefSchema = z.object({
  posto: z.string(),
  nome: z.string(),
  nomeGuerra: z.string().optional(),
  nf: z.string(),
});
export type ParteDiariaMilitarRef = z.infer<typeof parteDiariaMilitarRefSchema>;

/** Linha da tabela "Escalas de Serviço Operacional" (1 por militar de uma viatura). */
export const parteDiariaEscalaOperacionalMilitarSchema = z.object({
  funcao: z.string(),
  militarRaw: z.string(),
  militarNf: z.string().nullable(),
  observacao: z.string().default(''),
});
export type ParteDiariaEscalaOperacionalMilitar = z.infer<
  typeof parteDiariaEscalaOperacionalMilitarSchema
>;

/** Bloco de uma viatura na tabela "Escalas de Serviço Operacional". */
export const parteDiariaEscalaOperacionalEntrySchema = z.object({
  recurso: z.string(),
  vtrPrefixo: z.string().nullable(),
  vtrStatus: z.enum(STATUS_VIATURA).nullable(),
  /** KM inicial registrado pelo Motorista — editável pelo Fiscal. */
  kmInicial: z.number().int().nullable(),
  militares: z.array(parteDiariaEscalaOperacionalMilitarSchema).default([]),
});
export type ParteDiariaEscalaOperacionalEntry = z.infer<
  typeof parteDiariaEscalaOperacionalEntrySchema
>;

/** Linha de tabela horária genérica (Guarda, Ronda Noturna, Passagem Manhã). */
export const parteDiariaLinhaHorarioSchema = z.object({
  horario: z.string(),
  militar: z.string(),
  setorOuArea: z.string().default(''),
});
export type ParteDiariaLinhaHorario = z.infer<typeof parteDiariaLinhaHorarioSchema>;

/** Linha da Escala de Faxina. */
export const parteDiariaFaxinaSchema = z.object({
  militar: z.string(),
  local: z.string(),
});
export type ParteDiariaFaxina = z.infer<typeof parteDiariaFaxinaSchema>;

/** Linha da tabela "Ocorrências Confeccionadas" (registro manual; integração BAON futura). */
export const parteDiariaOcorrenciaSchema = z.object({
  vtr: z.string(),
  numeroBaon: z.string(),
  codigo: z.string(),
});
export type ParteDiariaOcorrencia = z.infer<typeof parteDiariaOcorrenciaSchema>;

/**
 * Override do Fiscal — campos editáveis persistidos por data.
 *
 * Tudo opcional: ausência = usar o derivado do rascunho. Se override
 * existe (mesmo string vazia), prevalece sobre o rascunho.
 */
export const parteDiariaOverrideSchema = z.object({
  fiscalQuePassa: parteDiariaMilitarRefSchema.nullable().optional(),
  fiscalSubstituto: parteDiariaMilitarRefSchema.nullable().optional(),
  textoAssuncao: z.string().optional(),
  /** Override de KM inicial por recurso (mapa recurso → km). */
  kmInicialPorRecurso: z.record(z.number().int().nullable()).optional(),
  textoTrocas: z.string().optional(),
  textoEscalaEspecial: z.string().optional(),
  textoEscalaExtraordinaria: z.string().optional(),
  textoIseo: z.string().optional(),
  escalaGuarda: z.array(parteDiariaLinhaHorarioSchema).optional(),
  escalaFaxina: z.array(parteDiariaFaxinaSchema).optional(),
  rondaNoturna: z.array(parteDiariaLinhaHorarioSchema).optional(),
  passagemServicoManha: z.array(parteDiariaLinhaHorarioSchema).optional(),
  textoInstrucao: z.string().optional(),
  textoCumprimentoNs: z.string().optional(),
  textoAlteracaoAlmoxarifado: z.string().optional(),
  textoAlteracaoViaturas: z.string().optional(),
  textoAlteracoesDiversas: z.string().optional(),
  ocorrenciasConfeccionadas: z.array(parteDiariaOcorrenciaSchema).optional(),
  textoPassagemServico: z.string().optional(),
});
export type ParteDiariaOverride = z.infer<typeof parteDiariaOverrideSchema>;

/**
 * Documento Parte Diária composto — resultado do `GET /parte-diaria/:data`.
 *
 * Retorna sempre o **estado mais recente**: rascunho derivado + override
 * mesclado. Campos read-only (cabeçalho, escalas operacionais, ideoFiscal)
 * ainda podem ser ajustados via override quando faz sentido (kmInicial,
 * fiscalQuePassa).
 */
export const parteDiariaSchema = z.object({
  data: z.string().regex(dataIsoRegex),
  proximoDia: z.string().regex(dataIsoRegex),

  /** Cabeçalho. */
  equipe: z.enum(LETRA_EQUIPE).nullable(),
  equipeNome: z.string().nullable(),

  /** Fiscal de Serviço (derivado da Prévia). */
  fiscalQueAssume: parteDiariaMilitarRefSchema.nullable(),
  /** Fiscal anterior (livre — Fiscal preenche; default null). */
  fiscalQuePassa: parteDiariaMilitarRefSchema.nullable(),
  /** Fiscal que assume após o turno (livre). */
  fiscalSubstituto: parteDiariaMilitarRefSchema.nullable(),

  /** Texto da Assunção de Serviço (pré-gerado, editável). */
  textoAssuncao: z.string(),

  /** Tabela "Escalas de Serviço Operacional" (1 entry por viatura). */
  escalasOperacionais: z.array(parteDiariaEscalaOperacionalEntrySchema).default([]),

  /** Texto numerado das Trocas de Serviço (pré-gerado, editável). */
  textoTrocas: z.string(),

  /** Bloco "ESCALAS — Especial | Extraordinária | ISEO". */
  textoEscalaEspecial: z.string(),
  textoEscalaExtraordinaria: z.string(),
  textoIseo: z.string(),

  /** Tabelas livres (Fiscal preenche manualmente). */
  escalaGuarda: z.array(parteDiariaLinhaHorarioSchema).default([]),
  escalaFaxina: z.array(parteDiariaFaxinaSchema).default([]),
  rondaNoturna: z.array(parteDiariaLinhaHorarioSchema).default([]),
  passagemServicoManha: z.array(parteDiariaLinhaHorarioSchema).default([]),

  textoInstrucao: z.string(),
  /** Texto institucional do Fiscal atestando IDEO (S6i). */
  textoIdeoFiscal: z.string(),
  textoCumprimentoNs: z.string(),
  textoAlteracaoAlmoxarifado: z.string(),
  textoAlteracaoViaturas: z.string(),
  textoAlteracoesDiversas: z.string(),

  ocorrenciasConfeccionadas: z.array(parteDiariaOcorrenciaSchema).default([]),
  textoPassagemServico: z.string(),

  geradoEm: z.string(),
  /** ISO timestamp da última edição feita via PUT (null = só rascunho). */
  ultimaEdicaoEm: z.string().nullable().default(null),
  ultimoEditorNf: z.string().nullable().default(null),
});
export type ParteDiaria = z.infer<typeof parteDiariaSchema>;

/** Body do PUT /parte-diaria/:data. */
export const upsertParteDiariaInputSchema = parteDiariaOverrideSchema;
export type UpsertParteDiariaInput = z.infer<typeof upsertParteDiariaInputSchema>;

const dataIsoParts = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Helper: dia seguinte em ISO (sem mexer em timezone — usa Date UTC). */
export function diaSeguinteIso(dataIso: string): string {
  const m = dataIsoParts.exec(dataIso);
  if (!m) throw new Error(`Data inválida: ${dataIso}`);
  const [, y, mm, d] = m;
  const dt = new Date(Date.UTC(Number(y), Number(mm) - 1, Number(d)));
  dt.setUTCDate(dt.getUTCDate() + 1);
  const yy = dt.getUTCFullYear();
  const mo = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mo}-${dd}`;
}

/** Formato curto BR de uma data ISO (ex.: 2026-05-04 → "04/05/2026"). */
export function formatDataBr(dataIso: string): string {
  const m = dataIsoParts.exec(dataIso);
  if (!m) return dataIso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

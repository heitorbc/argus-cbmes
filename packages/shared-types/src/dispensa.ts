import { z } from 'zod';

/**
 * S6j — Tipos canônicos de Dispensa (8 categorias).
 *
 * Lista institucional definida pelo Tech Lead (2026-05-10). Cada tipo tem
 * limite anual de dias por militar; `LIMITE_DIAS_POR_TIPO` codifica isso.
 *
 *   I — TAF institucional
 *   II — Exame de saúde
 *   III — Inovação
 *   IV — Instrução
 *   V — Aniversário
 *   VI — Assiduidade
 *   VII — Mérito disciplinar
 *   VIII — Situações diversas (publicação por ato específico)
 */
export const TIPO_DISPENSA = [
  'I_TAF',
  'II_EXAME',
  'III_INOVACAO',
  'IV_INSTRUCAO',
  'V_ANIVERSARIO',
  'VI_ASSIDUIDADE',
  'VII_MERITO',
  'VIII_DIVERSAS',
] as const;
export type TipoDispensa = (typeof TIPO_DISPENSA)[number];

export const TIPO_DISPENSA_LABEL: Record<TipoDispensa, string> = {
  I_TAF: 'I — TAF institucional',
  II_EXAME: 'II — Exame de saúde',
  III_INOVACAO: 'III — Inovação',
  IV_INSTRUCAO: 'IV — Instrução',
  V_ANIVERSARIO: 'V — Aniversário',
  VI_ASSIDUIDADE: 'VI — Assiduidade',
  VII_MERITO: 'VII — Mérito disciplinar',
  VIII_DIVERSAS: 'VIII — Situações diversas',
};

/**
 * Limite anual de dias por militar por tipo. Para `VIII_DIVERSAS` o controle
 * é por ato específico publicado (sem limite numérico), por isso o valor
 * sentinela `999`.
 */
export const LIMITE_DIAS_POR_TIPO: Record<TipoDispensa, number> = {
  I_TAF: 4,
  II_EXAME: 2,
  III_INOVACAO: 2,
  IV_INSTRUCAO: 2,
  V_ANIVERSARIO: 1,
  VI_ASSIDUIDADE: 6,
  VII_MERITO: 2,
  VIII_DIVERSAS: 999,
};

/**
 * Entidade Dispensa registrada por militar/tipo/período.
 *
 * Pode ser criada em 2 lugares:
 *  - Página `/cadastros/dispensas` (Sargenteação, S6j).
 *  - Ajuste pré-turno da Prévia (S6j refator do `previaDispensaSchema`).
 *
 * Sem CRUD distinto — ambas apontam para a mesma entidade.
 */
export const dispensaSchema = z.object({
  id: z.string(),
  militarNf: z.string().min(1),
  tipo: z.enum(TIPO_DISPENSA),
  /** Data ISO `YYYY-MM-DD` em que a dispensa começa. */
  dataInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Quantidade de dias (1-365). Inclui o dia de início. */
  dias: z.number().int().min(1).max(365),
  /** Número do documento E-Docs (não obrigatório). */
  numeroEdocs: z.string().optional(),
  /** Observação livre (motivo extra, contexto, etc.). */
  observacoes: z.string().optional(),
  criadoEm: z.string(),
  criadoPorNf: z.string(),
});
export type Dispensa = z.infer<typeof dispensaSchema>;

export const createDispensaInputSchema = z.object({
  militarNf: z.string().min(1, 'Militar obrigatório'),
  tipo: z.enum(TIPO_DISPENSA),
  dataInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data início no formato YYYY-MM-DD'),
  dias: z.number().int().min(1).max(365),
  numeroEdocs: z.string().trim().optional(),
  observacoes: z.string().trim().optional(),
});
export type CreateDispensaInput = z.infer<typeof createDispensaInputSchema>;

export const updateDispensaInputSchema = z.object({
  tipo: z.enum(TIPO_DISPENSA).optional(),
  dataInicio: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  dias: z.number().int().min(1).max(365).optional(),
  numeroEdocs: z.string().trim().optional(),
  observacoes: z.string().trim().optional(),
});
export type UpdateDispensaInput = z.infer<typeof updateDispensaInputSchema>;

/**
 * Saldo de dispensas gozadas por um militar num ano (S6j — perfil militar).
 *
 * Para cada tipo: total de dias gozados, limite, e dias restantes.
 */
export const dispensaSaldoTipoSchema = z.object({
  tipo: z.enum(TIPO_DISPENSA),
  diasGozados: z.number().int().nonnegative(),
  limite: z.number().int().nonnegative(),
  diasRestantes: z.number().int(),
});
export type DispensaSaldoTipo = z.infer<typeof dispensaSaldoTipoSchema>;

export const dispensaSaldoMilitarSchema = z.object({
  militarNf: z.string(),
  ano: z.number().int(),
  saldosPorTipo: z.array(dispensaSaldoTipoSchema),
  totalGozado: z.number().int().nonnegative(),
});
export type DispensaSaldoMilitar = z.infer<typeof dispensaSaldoMilitarSchema>;

/**
 * Helper: retorna `true` se a dispensa está ativa em uma data específica
 * (data ISO entre `dataInicio` inclusive e `dataInicio + dias` exclusive).
 */
export function dispensaAtivaNoDia(
  d: Pick<Dispensa, 'dataInicio' | 'dias'>,
  dataIso: string,
): boolean {
  const inicio = new Date(`${d.dataInicio}T00:00:00Z`).getTime();
  const fim = inicio + d.dias * 24 * 60 * 60 * 1000;
  const alvo = new Date(`${dataIso}T00:00:00Z`).getTime();
  return alvo >= inicio && alvo < fim;
}

/**
 * Helper: calcula o saldo anual de dispensas de um militar.
 * Considera apenas dispensas com `dataInicio` cujo ano bate.
 */
export function calcularSaldoMilitar(
  dispensas: readonly Dispensa[],
  militarNf: string,
  ano: number,
): DispensaSaldoMilitar {
  const filtradas = dispensas.filter(
    (d) => d.militarNf === militarNf && Number(d.dataInicio.slice(0, 4)) === ano,
  );
  const saldosPorTipo = TIPO_DISPENSA.map((tipo) => {
    const diasGozados = filtradas
      .filter((d) => d.tipo === tipo)
      .reduce((acc, d) => acc + d.dias, 0);
    const limite = LIMITE_DIAS_POR_TIPO[tipo];
    return {
      tipo,
      diasGozados,
      limite,
      diasRestantes: Math.max(0, limite - diasGozados),
    };
  });
  const totalGozado = saldosPorTipo.reduce((acc, s) => acc + s.diasGozados, 0);
  return { militarNf, ano, saldosPorTipo, totalGozado };
}

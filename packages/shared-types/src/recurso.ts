import { z } from 'zod';

/**
 * Categoria do Recurso — usada pelo PreviaService para decidir como tratar
 * a entrada na composição:
 *   - OPERACIONAL: viatura padrão da equipe rotativa A/B/C/D (parsed do XLSX da SOS)
 *   - STAFF: complemento fixo do MF (CHEFE DE OPERAÇÕES) — bucket "STAFF" na composição
 *   - AQUATICA: pelotão de aquáticas (MERGULHO/SALVAMAR/QUADRICICLO) — bucket "AQUATICAS"
 *   - GUARDA: serviço da guarda interna (não vai pra Prévia operacional)
 */
export const CATEGORIA_RECURSO = ['OPERACIONAL', 'STAFF', 'AQUATICA', 'GUARDA'] as const;
export type CategoriaRecurso = (typeof CATEGORIA_RECURSO)[number];

/**
 * S2.13b — Tipo de composição do recurso.
 *
 *   - viatura_only: apenas viatura (ex.: FLORESTAL é só a viatura no MF)
 *   - equipe_only: apenas equipe (ex.: GUARDA, DRO/TELEFONISTA)
 *   - viatura_e_equipe: viatura + equipe mínima (ex.: ABTS_01 = vtr + chefe/motorista/operador)
 *
 * Substitui semanticamente o par `comportaViatura`/`comportaEfetivo` (preservados
 * para back-compat até S2.14).
 */
export const TIPO_COMPOSICAO_RECURSO = ['viatura_only', 'equipe_only', 'viatura_e_equipe'] as const;
export type TipoComposicaoRecurso = (typeof TIPO_COMPOSICAO_RECURSO)[number];

/**
 * S2.13b — Função de um militar na equipe mínima do recurso.
 *
 *   - funcao: rótulo institucional (chefe, motorista, operador, socorrista,
 *     sentinela, ...). Texto livre (não há enum centralizado pois unidades
 *     podem ter funções específicas — quadricicleiro, telefonista, etc.).
 *   - obrigatorio: true = sem este militar, recurso não consegue operar; false
 *     = posição opcional (ex.: "operador 2" em ABTS de 3 militares).
 *   - podeAcumularCom: outras funções que o mesmo militar pode acumular nesse
 *     recurso (ex.: motorista que também é chefe — "chefe e motorista são a
 *     mesma pessoa"). Lista de rótulos textuais. Vazio = não acumula.
 */
export const funcaoEquipeMinimaSchema = z.object({
  funcao: z.string().min(1, 'Função obrigatória'),
  obrigatorio: z.boolean(),
  podeAcumularCom: z.array(z.string()).optional(),
});
export type FuncaoEquipeMinima = z.infer<typeof funcaoEquipeMinimaSchema>;

/**
 * Recurso institucional configurável da unidade.
 *
 * S6d — substitui a whitelist hardcoded `RECURSOS_VALIDOS` (parser MF) e
 * `RECURSOS_STAFF`/`RECURSOS_AQUATICAS` (previa.service) por entidade
 * persistida e configurável.
 *
 * S2.13b — ganha `tipoComposicao`, `equipeMinima` e `viaturaPrefixoFixo`.
 *
 * Persistência in-memory (Fase 1); migra para Prisma+Supabase em sprint futura.
 */
export const recursoSchema = z.object({
  id: z.string(),
  unidadeId: z.string(),
  /**
   * Nome canônico — DEVE casar exatamente com o texto da col A do MF
   * (ex.: "ABTS_01", "MERGULHO 01", "DRO / TELEFONISTA").
   */
  nome: z.string().min(1),
  categoria: z.enum(CATEGORIA_RECURSO),
  /** Se false, parser do MF ignora este recurso. */
  ativo: z.boolean(),
  /** Se true, espera prefixo de viatura e status na col B/C do MF. */
  comportaViatura: z.boolean(),
  /** Se true, espera militares (chefe/motorista/operadores) nas cols D-J do MF. */
  comportaEfetivo: z.boolean(),
  /**
   * S2.13b — Tipo formal de composição. Substitui semanticamente o par
   * comportaViatura/comportaEfetivo. Os antigos campos são mantidos por
   * back-compat (parser MF ainda os consulta até S2.14).
   */
  tipoComposicao: z.enum(TIPO_COMPOSICAO_RECURSO),
  /**
   * S2.13b — Equipe mínima esperada para o recurso operar. Vazio/null quando
   * `tipoComposicao === 'viatura_only'`. Ordem reflete prioridade institucional
   * (chefe primeiro, depois motorista, depois operadores).
   */
  equipeMinima: z.array(funcaoEquipeMinimaSchema).nullable(),
  /**
   * S2.13b — Prefixo de viatura específico quando o recurso usa SEMPRE uma
   * viatura concreta (ex.: ATB-13456). Null = qualquer viatura do tipo
   * inferido pelo prefixo do recurso (default histórico).
   */
  viaturaPrefixoFixo: z.string().nullable(),
  /** Ordem de exibição (espelha a ordem na planilha do MF). */
  ordem: z.number().int().nonnegative(),
  criadoEm: z.string(),
  atualizadoEm: z.string(),
});
export type Recurso = z.infer<typeof recursoSchema>;

export const createRecursoInputSchema = z.object({
  unidadeId: z.string().min(1, 'Unidade obrigatória'),
  nome: z.string().min(1, 'Nome obrigatório'),
  categoria: z.enum(CATEGORIA_RECURSO),
  ativo: z.boolean().optional(),
  comportaViatura: z.boolean(),
  comportaEfetivo: z.boolean(),
  tipoComposicao: z.enum(TIPO_COMPOSICAO_RECURSO).optional(),
  equipeMinima: z.array(funcaoEquipeMinimaSchema).nullable().optional(),
  viaturaPrefixoFixo: z.string().nullable().optional(),
  ordem: z.number().int().nonnegative(),
});
export type CreateRecursoInput = z.infer<typeof createRecursoInputSchema>;

export const updateRecursoInputSchema = z.object({
  nome: z.string().min(1).optional(),
  categoria: z.enum(CATEGORIA_RECURSO).optional(),
  ativo: z.boolean().optional(),
  comportaViatura: z.boolean().optional(),
  comportaEfetivo: z.boolean().optional(),
  tipoComposicao: z.enum(TIPO_COMPOSICAO_RECURSO).optional(),
  equipeMinima: z.array(funcaoEquipeMinimaSchema).nullable().optional(),
  viaturaPrefixoFixo: z.string().nullable().optional(),
  ordem: z.number().int().nonnegative().optional(),
});
export type UpdateRecursoInput = z.infer<typeof updateRecursoInputSchema>;

import { z } from 'zod';
import { viaturaSchema } from './viatura.js';

/**
 * Item 3 — Viatura lida da planilha QDV (aba `1BBM_1CIA`).
 *
 * Campos selecionados (do total de ~21 no XLSX) que são relevantes para
 * o ARGUS. Demais campos (cartão de abastecimento, chassi, renavam, etc.)
 * ficam no `extras: Record<string,string>` opcional para inspeção sem
 * exigir mudança de schema.
 */
export const viaturaQdvSchema = z.object({
  prefixo: z.string().min(1),
  status: z.string().optional(), // "DISPONÍVEL" | "BAIXADA" | "EMPRESTADA" (label da planilha)
  emprestadaA: z.string().optional(),
  kmAtual: z.number().int().optional(),
  observacao: z.string().optional(),
  empregoPrimario: z.string().optional(),
  empregoSecundario: z.string().optional(),
  placa: z.string().optional(),
  marcaModelo: z.string().optional(),
  combustivel: z.string().optional(),
  obm: z.string().optional(),
});
export type ViaturaQdv = z.infer<typeof viaturaQdvSchema>;

/**
 * S0.5/3.1 — Aba `BASE_LISTA` da QDV: cadastro mestre detalhado das
 * viaturas de uma OBM, com nomenclatura, ano, modelo e renavam.
 * Granularidade superior à aba `1BBM_1CIA` (que é operacional/diário).
 */
export const viaturaQdvBaseListaSchema = z.object({
  obm: z.string(),
  prefixo: z.string(),
  nomenclatura: z.string().optional(),
  ano: z.string().optional(),
  status: z.string().optional(),
  emprestadaA: z.string().optional(),
  kmAtual: z.number().int().optional(),
  observacao: z.string().optional(),
  empregoPrimario: z.string().optional(),
  empregoSecundario: z.string().optional(),
  placa: z.string().optional(),
  renavam: z.string().optional(),
  categoriaCnh: z.string().optional(),
  marcaModelo: z.string().optional(),
  combustivel: z.string().optional(),
  modeloPneu: z.string().optional(),
});
export type ViaturaQdvBaseLista = z.infer<typeof viaturaQdvBaseListaSchema>;

/**
 * S0.5/3.1 — Aba `BASE_VTR_LISTA_PRINCIPAL` da QDV: cadastro de TODAS
 * as viaturas do CBMES (não apenas 1ª Cia/1º BBM), identificadas
 * primariamente pelo PREFIXO.
 */
export const viaturaCbmesSchema = z.object({
  obm: z.string(),
  prefixoComUnderscore: z.string(),
  prefixo: z.string(),
  nomenclatura: z.string().optional(),
  ano: z.string().optional(),
  idade: z.string().optional(),
  observacao: z.string().optional(),
  placa: z.string().optional(),
  renavam: z.string().optional(),
  categoriaCnh: z.string().optional(),
  tipoVeiculo: z.string().optional(),
  marcaModelo: z.string().optional(),
  combustivel: z.string().optional(),
  modeloPneu: z.string().optional(),
});
export type ViaturaCbmes = z.infer<typeof viaturaCbmesSchema>;

/**
 * S0.5/3.1 — Aba `Contatos_LOGISTICAS` da QDV: responsável logístico
 * das viaturas da unidade.
 */
export const contatoLogisticoSchema = z.object({
  obm: z.string(),
  nf: z.string(),
  militarResponsavel: z.string(),
  nomeCompleto: z.string().optional(),
  telefone: z.string().optional(),
  email: z.string().optional(),
});
export type ContatoLogistico = z.infer<typeof contatoLogisticoSchema>;

/**
 * S0.x — Visão consolidada de uma viatura para a página
 * `/cadastros/viaturas`. Lista vem da aba `1BBM_1CIA` da QDV
 * (fonte de verdade), enriquecida com BASE_LISTA (renavam, modelo
 * pneu, ano, nomenclatura, categoria CNH), Mapa Força (status diário)
 * e Contatos_LOGISTICAS (responsável da unidade — único na footer).
 */
export const viaturaEnriquecidaSchema = z.object({
  prefixo: z.string(),
  obm: z.string(),
  nomenclatura: z.string().optional(),
  ano: z.string().optional(),
  /** Status como string (label da QDV: "DISPONÍVEL"/"BAIXADA"/...). */
  statusQdv: z.string().optional(),
  /** Status enum oficial vindo do Mapa Força (StatusViatura). */
  statusMf: z.enum(['DISPONIVEL', 'BAIXADA', 'EMPRESTADA']).nullable().optional(),
  emprestadaA: z.string().optional(),
  kmAtual: z.number().int().optional(),
  observacao: z.string().optional(),
  empregoPrimario: z.string().optional(),
  empregoSecundario: z.string().optional(),
  placa: z.string().optional(),
  renavam: z.string().optional(),
  categoriaCnh: z.string().optional(),
  /** Vem da aba `BASE_VTR_LISTA_PRINCIPAL` (cadastro CBMES). */
  tipoVeiculo: z.string().optional(),
  marcaModelo: z.string().optional(),
  combustivel: z.string().optional(),
  modeloPneu: z.string().optional(),
});
export type ViaturaEnriquecida = z.infer<typeof viaturaEnriquecidaSchema>;

/**
 * S0.x — DTO de detalhe da viatura para `/cadastros/viaturas/:prefixo`.
 * Combina visão consolidada QDV (read-only) + override interno editável +
 * contato logístico da unidade.
 */
export const viaturaDetalheSchema = z.object({
  qdv: viaturaEnriquecidaSchema,
  interno: viaturaSchema.nullable(),
  contatoResponsavel: contatoLogisticoSchema.nullable(),
});
export type ViaturaDetalhe = z.infer<typeof viaturaDetalheSchema>;

import { z } from 'zod';
import { TIPOS_VIATURA, type TipoViatura } from './viatura.js';

/**
 * S8 — Conferência de Materiais por viatura.
 *
 * Cada viatura operacional carrega um conjunto de equipamentos/materiais
 * institucionais (mangueiras, chave de hidrante, escada, EPI, etc.).
 * Antes de entrar em serviço, o Chefe da Viatura confere cada item da
 * lista padrão (definida por tipo de viatura) e marca:
 *   - **OK**: presente e em condição operacional.
 *   - **AUSENTE**: não está na viatura.
 *   - **DANIFICADO**: está mas não opera.
 *
 * Itens com status ≠ OK alimentam o texto "ALTERAÇÃO DE ALMOXARIFADO"
 * na Parte Diária do dia.
 *
 * Persistência in-memory (Fase 1); migra para tabela em S5b.
 */

const dataIsoRegex = /^\d{4}-\d{2}-\d{2}$/;

export const STATUS_ITEM_MATERIAL = ['OK', 'AUSENTE', 'DANIFICADO'] as const;
export type StatusItemMaterial = (typeof STATUS_ITEM_MATERIAL)[number];

export const STATUS_ITEM_MATERIAL_LABEL: Record<StatusItemMaterial, string> = {
  OK: 'OK',
  AUSENTE: 'Ausente',
  DANIFICADO: 'Danificado',
};

/**
 * Checklist padrão por tipo de viatura (MVP hardcoded; em S5b vira tabela
 * `material_checklist` editável via /cadastros/materiais).
 *
 * As listas vêm de portarias institucionais do CBMES — o MVP cobre os
 * itens mais críticos para iniciar o uso do módulo. O Tech Lead pode
 * ajustar diretamente no fonte por enquanto.
 */
export const CHECKLIST_PADRAO_POR_TIPO: Record<TipoViatura, readonly string[]> = {
  ABTS: [
    'Mangueira de 38mm × 2',
    'Mangueira de 65mm × 2',
    'Esguicho regulável',
    'Chave de hidrante',
    'Adaptador Storz',
    'Extintor de pó',
    'Linha-vida (cabo de salvamento)',
    'Conjunto SCBA (ar respirável)',
  ],
  AR: [
    'Maca rígida',
    'Cinto-aranha (imobilizador)',
    'Colar cervical (3 tamanhos)',
    'Talas pneumáticas',
    'KED (colete de extricação)',
    'Bolsa de APH completa',
    'Desfibrilador automático (DEA)',
    'Cilindro de O₂ portátil',
  ],
  ATB: [
    'Cabo de salvamento (50m)',
    'Trio de cordas dinâmicas',
    'Conjunto de mosquetões + fitas',
    'Capacete de salvamento',
    'EPI completo (luva + óculos)',
    'Lanterna de cabeça',
  ],
  AU: [
    'Documentação da viatura',
    'Triângulo + chave de roda',
    'Estepe pressurizado',
    'Kit de primeiros socorros',
  ],
  AM: [
    'Conjunto de mergulho completo (regulador + cilindro)',
    'Máscara facial + snorkel',
    'Nadadeiras (par)',
    'Cinto de lastro',
    'Cabo guia',
    'Boia de marcação',
  ],
  AC: ['Documentação + chave', 'Triângulo de sinalização'],
  TE: [
    'Mangotinho × 2',
    'Esguicho de espuma',
    'LGE (líquido gerador de espuma)',
    'Adaptador 38/65',
  ],
};

/** Item conferido (snapshot do estado registrado pelo Chefe). */
export const itemConferenciaMaterialSchema = z.object({
  label: z.string().min(1),
  status: z.enum(STATUS_ITEM_MATERIAL),
  observacao: z.string().optional(),
});
export type ItemConferenciaMaterial = z.infer<typeof itemConferenciaMaterialSchema>;

/** Registro completo da conferência de materiais de 1 viatura num dia. */
export const conferenciaMateriaisDoDiaSchema = z.object({
  id: z.string(),
  data: z.string().regex(dataIsoRegex),
  vtrPrefixo: z.string(),
  itens: z.array(itemConferenciaMaterialSchema).min(1),
  registradoPorNf: z.string(),
  registradoEm: z.string(),
});
export type ConferenciaMateriaisDoDia = z.infer<typeof conferenciaMateriaisDoDiaSchema>;

export const registrarConferenciaMateriaisInputSchema = z.object({
  data: z.string().regex(dataIsoRegex),
  vtrPrefixo: z.string().trim().min(1),
  itens: z.array(itemConferenciaMaterialSchema).min(1, 'Pelo menos 1 item conferido'),
});
export type RegistrarConferenciaMateriaisInput = z.infer<
  typeof registrarConferenciaMateriaisInputSchema
>;

/**
 * Helper público: dado o tipo da viatura, devolve a lista padrão de itens
 * a conferir. Caso o tipo não tenha checklist explícito, devolve vazio.
 */
export function checklistPadraoPorTipo(tipo: TipoViatura | null | undefined): readonly string[] {
  if (!tipo) return [];
  return CHECKLIST_PADRAO_POR_TIPO[tipo] ?? [];
}

export { TIPOS_VIATURA };

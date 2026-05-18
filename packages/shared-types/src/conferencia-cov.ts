import { z } from 'zod';

/**
 * S2.10.6 — Conferência do COV/Motorista da viatura.
 *
 * Antes da execução do serviço, o COV/Motorista aceita o Termo de
 * Responsabilidade e preenche checklist de 25 itens cobrindo
 * dirigibilidade conforme exigências do CTB + portarias CBMES 330-R/2014
 * e 135-R/2008.
 */

/** Categorias do checklist do COV. */
export const CATEGORIAS_CHECKLIST_COV = [
  'inspecao_externa',
  'compartimento_motor',
  'cabine',
  'equipamentos_emergencia',
] as const;
export type CategoriaChecklistCov = (typeof CATEGORIAS_CHECKLIST_COV)[number];

export const CATEGORIA_CHECKLIST_COV_LABEL: Record<CategoriaChecklistCov, string> = {
  inspecao_externa: 'Inspeção externa (volta completa no veículo)',
  compartimento_motor: 'Compartimento do motor',
  cabine: 'Cabine e itens de condução',
  equipamentos_emergencia: 'Equipamentos de emergência da viatura',
};

/**
 * Checklist canônico (25 itens em 4 categorias). Ordem preservada na UI.
 * Adicionar/remover itens aqui altera o template default; conferências
 * antigas continuam armazenadas como estavam.
 */
export const CHECKLIST_COV_TEMPLATE: ReadonlyArray<{
  categoria: CategoriaChecklistCov;
  descricao: string;
}> = [
  // Inspeção externa (7)
  {
    categoria: 'inspecao_externa',
    descricao: 'Lataria, para-choques e estribos sem avarias novas',
  },
  {
    categoria: 'inspecao_externa',
    descricao: 'Pneus calibrados, sem cortes, bolhas ou desgaste irregular (incluindo estepe)',
  },
  { categoria: 'inspecao_externa', descricao: 'Parafusos das rodas firmes' },
  {
    categoria: 'inspecao_externa',
    descricao: 'Faróis, lanternas, luz de freio, ré, pisca-alerta e setas funcionando',
  },
  {
    categoria: 'inspecao_externa',
    descricao: 'Giroflex, sirene e sinalização acústica/luminosa em pleno funcionamento',
  },
  {
    categoria: 'inspecao_externa',
    descricao: 'Plotagem, prefixo e identificação visíveis e em bom estado',
  },
  {
    categoria: 'inspecao_externa',
    descricao: 'Ausência de vazamentos visíveis sob o veículo (óleo, combustível, água)',
  },
  // Compartimento do motor (7)
  { categoria: 'compartimento_motor', descricao: 'Nível de óleo do motor' },
  {
    categoria: 'compartimento_motor',
    descricao: 'Nível de água do radiador / reservatório de expansão',
  },
  { categoria: 'compartimento_motor', descricao: 'Nível do fluido de freio' },
  { categoria: 'compartimento_motor', descricao: 'Nível do fluido da direção hidráulica' },
  { categoria: 'compartimento_motor', descricao: 'Nível do líquido do limpador de para-brisa' },
  {
    categoria: 'compartimento_motor',
    descricao: 'Correias e mangueiras sem ressecamento ou folgas',
  },
  { categoria: 'compartimento_motor', descricao: 'Bateria firme, terminais limpos e sem oxidação' },
  // Cabine e itens de condução (8)
  { categoria: 'cabine', descricao: 'Cintos de segurança em funcionamento (todos os assentos)' },
  { categoria: 'cabine', descricao: 'Bancos, espelhos retrovisores e volante regulados' },
  { categoria: 'cabine', descricao: 'Painel sem luzes de advertência acesas' },
  { categoria: 'cabine', descricao: 'Buzina, limpadores de para-brisa e desembaçador funcionando' },
  { categoria: 'cabine', descricao: 'Freio de serviço e freio de estacionamento testados' },
  { categoria: 'cabine', descricao: 'Marcador de combustível com nível adequado para a missão' },
  { categoria: 'cabine', descricao: 'Rádio comunicador operante e na frequência correta' },
  { categoria: 'cabine', descricao: 'Tacógrafo/odômetro funcionando' },
  // Equipamentos de emergência (3)
  { categoria: 'equipamentos_emergencia', descricao: 'Triângulo de sinalização' },
  {
    categoria: 'equipamentos_emergencia',
    descricao: 'Macaco, chave de roda e estepe em condições de uso',
  },
  {
    categoria: 'equipamentos_emergencia',
    descricao: 'Cones e fitas de isolamento (quando previstos para a viatura)',
  },
];

export const checklistCovItemSchema = z.object({
  categoria: z.enum(CATEGORIAS_CHECKLIST_COV),
  descricao: z.string(),
  ok: z.boolean(),
  observacao: z.string().optional(),
});
export type ChecklistCovItem = z.infer<typeof checklistCovItemSchema>;

export const conferenciaCovSchema = z.object({
  id: z.string(),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  vtrPrefixo: z.string(),
  motoristaNf: z.string(),
  termoAceitoEm: z.string(),
  itens: z.array(checklistCovItemSchema),
  observacao: z.string().optional(),
  criadoEm: z.string(),
  atualizadoEm: z.string(),
});
export type ConferenciaCov = z.infer<typeof conferenciaCovSchema>;

export const registrarConferenciaCovInputSchema = z.object({
  termoAceitoEm: z.string().regex(/^\d{4}-\d{2}-\d{2}T/),
  itens: z.array(checklistCovItemSchema).min(1, 'Checklist obrigatório'),
  observacao: z.string().optional(),
});
export type RegistrarConferenciaCovInput = z.infer<typeof registrarConferenciaCovInputSchema>;

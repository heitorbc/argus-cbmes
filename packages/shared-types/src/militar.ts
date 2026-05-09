import { z } from 'zod';

/**
 * Sub-seção de uma militar dentro da 1ª Cia/1º BBM, derivada do agrupamento
 * por seção no QDI (ver `qdi-csv-parser.ts`):
 *  - `staff`     — Comando da 1ª Cia, Secretaria, Sargenteante, Almoxarifado (ADM 11)
 *  - `sos`       — Seção de Operações de Salvamento (equipes A/B/C/D, PRONT 11)
 *  - `guarda`    — Guarda QCG (sentinelas, GUARD 11)
 *  - `aquaticas` — Pelotão de Atividades Aquáticas (mergulho/salvamar, PRONT AA)
 */
export const SUB_SECOES = ['staff', 'sos', 'guarda', 'aquaticas'] as const;
export type SubSecao = (typeof SUB_SECOES)[number];

export const SUB_SECAO_LABEL: Record<SubSecao, string> = {
  staff: 'Comando 1ª Cia',
  sos: 'Seção de Operações',
  guarda: 'Guarda QCG',
  aquaticas: 'Pelotão de Atividades Aquáticas',
};

/**
 * Militar consolidado a partir de duas fontes:
 *   - Planilha QDI (operacional, 1ª Cia) — primária
 *   - Planilha EFETIVO (demográfica, CBMES inteiro) — complementar
 *
 * Display name preferencial: `${posto} ${nomeGuerra ?? primeiroNomeDe(nome)}`.
 *
 * RF-CM-101 / RF-CM-102 do PRD v2.0.
 */
export const militarSchema = z.object({
  nf: z.string().min(1),
  /** Antiguidade — menor = mais antigo. Vinda do QDI quando disponível, EFETIVO como fallback. */
  ant: z.number().int().nonnegative(),
  /** Posto/graduação atual (ex.: `2ºSGT`, `1ºTEN QOC`, `CB`, `SD`). */
  posto: z.string().min(1),
  /** Nome completo (do EFETIVO; pode estar ausente quando o militar só consta no QDI). */
  nome: z.string().min(1),

  // ---------- Campos do QDI (operacional, 1ª Cia) ---------- //
  /** Nome de guerra (ex.: `BARCELLOS`, `D. MATTOS`, `VASSEM`). */
  nomeGuerra: z.string().optional(),
  /** Função na unidade (ex.: `Comandante`, `Sargenteante`, `Condutor`). Pode estar vazia. */
  funcao: z.string().optional(),
  /** Unidade de lotação operacional (ex.: `1ª Cia / 1º BBM`). */
  unidade: z.string().optional(),
  /** Sub-seção dentro da 1ª Cia (vem do QDI). */
  subSecao: z.enum(SUB_SECOES).optional(),
  /** Posto previsto (slot na escala) — pode diferir do posto atual. */
  postoPrevisto: z.string().optional(),

  // ---------- Campos do EFETIVO (demográfico) ---------- //
  /** Município de residência (não é lotação). */
  municipio: z.string().optional(),
  /** Idade em anos completos. */
  idade: z.number().int().nonnegative().optional(),
  /** Tempo de serviço em anos. */
  servico: z.number().int().nonnegative().optional(),

  // ---------- Combinado ---------- //
  /** Situação funcional. Do QDI: `APTO`, `FÉRIAS`, `ADIDO`, `OUTROS`. */
  situacao: z.string().optional(),

  // ---------- Campos novos (S6a — aba DADOS do QDI) ---------- //
  /** Lotação (col LOCAL da aba DADOS): "1ª1º", "2ª/1º", "SAT", etc. */
  lotacao: z.string().optional(),
  /** Classe (ex.: "ADM 11", "PRONT 11", "GUARD 11", "PRONT AA"). */
  classe: z.string().optional(),
  /** Conceito disciplinar (ex.: "CD-A", "CD-B"). */
  conceitoDisciplinar: z.string().optional(),
  /** Pontos disciplinares. */
  pontos: z.number().int().nonnegative().optional(),
  /** Carteira de habilitação (ex.: "AB", "B", "AD", "D"). */
  cnh: z.string().optional(),
  /** Validade da CNH (formato bruto da planilha, ex.: "12/02/2024"). */
  cnhValidade: z.string().optional(),
  /** Data de incorporação (formato bruto, ex.: "19/03/2001"). */
  incorporacao: z.string().optional(),
  /** Plano de férias previsto (mês ex.: "NOV", "MAR"). */
  planoFerias: z.string().optional(),
  /** Curso de mergulho (SIM/NÃO). */
  mergulho: z.string().optional(),
  /** Curso FTBA (SIM/NÃO). */
  ftba: z.string().optional(),
  /** Curso ETSP (SIM/NÃO). */
  etsp: z.string().optional(),
  /** Curso CCVE (SIM/NÃO) + validade. */
  ccve: z.string().optional(),
  ccveValidade: z.string().optional(),
  /** Censo (mês/ano última realização). */
  censo: z.string().optional(),
  /** Origens das fontes que contribuíram para este militar (debug). */
  origensFonte: z.array(z.enum(['DADOS', '1ª1º', 'EFETIVO'])).optional(),
});
export type Militar = z.infer<typeof militarSchema>;

/**
 * Compõe o nome para exibição institucional preferindo nome de guerra do QDI.
 * Fallback: primeiro nome do nome completo. Sempre prefixa com posto.
 */
export function formatDisplayName(m: Pick<Militar, 'posto' | 'nome' | 'nomeGuerra'>): string {
  if (m.nomeGuerra && m.nomeGuerra.trim().length > 0) {
    return `${m.posto} ${m.nomeGuerra}`;
  }
  const primeiroNome = (m.nome ?? '').trim().split(/\s+/)[0] ?? '';
  return primeiroNome ? `${m.posto} ${primeiroNome}` : m.posto;
}

export const efetivoListResponseSchema = z.object({
  items: z.array(militarSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  totalPages: z.number().int().min(1),
  /** ISO timestamp da última sincronização com a planilha. */
  syncedAt: z.string(),
  /** True se os dados são do último snapshot bem-sucedido (sync atual falhou). */
  stale: z.boolean(),
});
export type EfetivoListResponse = z.infer<typeof efetivoListResponseSchema>;

export const efetivoQuerySchema = z.object({
  q: z.string().optional(),
  /** Quando true, retorna apenas militares cuja `subSecao` está definida (i.e., 1ª Cia). */
  somente1aCia: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type EfetivoQuery = z.infer<typeof efetivoQuerySchema>;

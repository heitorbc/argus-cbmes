import { z } from 'zod';

export const LETRA_EQUIPE = ['A', 'B', 'C', 'D', 'AQUATICAS', 'STAFF'] as const;
export type LetraEquipe = (typeof LETRA_EQUIPE)[number];

/**
 * Equipes operacionais rotativas (A/B/C/D) — só essas aparecem como `diaEquipe[data]`
 * no XLSX da SOS. AQUATICAS/STAFF são bucketing de tripulação fixa (mergulho, ChOp)
 * que vem do Mapa Força e não rotaciona.
 */
export const LETRA_EQUIPE_ROTATIVA = ['A', 'B', 'C', 'D'] as const;
export type LetraEquipeRotativa = (typeof LETRA_EQUIPE_ROTATIVA)[number];

export const LETRA_EQUIPE_LABEL: Record<LetraEquipe, string> = {
  A: 'ALFA',
  B: 'BRAVO',
  C: 'CHARLIE',
  D: 'DELTA',
  AQUATICAS: 'PEL. AQUÁTICAS',
  STAFF: 'COMANDO',
};

/**
 * Ordem canônica dos recursos para exibição na Prévia/PD. ATB precede
 * PLATAFORMA imediatamente para facilitar a conferência (são operadas
 * pelo mesmo militar via `expandViaturaFuncao`). Recursos não listados
 * aqui caem no final em ordem alfabética.
 */
export const RECURSO_ORDEM_CANONICA: readonly string[] = [
  'CHEFE DE OPERAÇÕES',
  'ABTS_01',
  'ABTS_02',
  'RESGATE 01',
  'RESGATE 02',
  'ATB',
  'PLATAFORMA',
  'GUARDA',
  'MERGULHO 01',
  'MERGULHO 02',
  'SALVAMAR 01',
  'SALVAMAR 02',
  'QUADRICICLO 01',
  'QUADRICICLO 02',
];

/** Posição na ordem canônica; recursos desconhecidos retornam `Infinity`. */
export function recursoOrdemIndex(recurso: string): number {
  const i = RECURSO_ORDEM_CANONICA.indexOf(recurso);
  return i < 0 ? Number.POSITIVE_INFINITY : i;
}

/** Referência de militar conforme aparece na célula da escala XLSX. */
export const militarRefSchema = z.object({
  raw: z.string(),
  postoAbreviado: z.string(),
  nomeGuerra: z.string(),
  nf: z.string().optional(),
});
export type MilitarRef = z.infer<typeof militarRefSchema>;

/**
 * Uma posição na composição de uma equipe.
 * Ex.: equipe=A, viatura="ABTS 01", funcao="Ch" → CB FABRE
 */
export const composicaoEntrySchema = z.object({
  equipe: z.enum(LETRA_EQUIPE),
  viatura: z.string(),
  funcao: z.string(),
  militar: militarRefSchema,
});
export type ComposicaoEntry = z.infer<typeof composicaoEntrySchema>;

/**
 * Equipes de Mergulho (3 equipes paralelas A/B/C, distintas das rotativas
 * A/B/C/D). Cada equipe tem 4 militares fixos no cadastro do XLSX. Cada
 * dia do mês 1 ou 2 das equipes está de plantão em MERGULHO 01/02.
 */
export const LETRA_EQUIPE_MERGULHO = ['A', 'B', 'C'] as const;
export type LetraEquipeMergulho = (typeof LETRA_EQUIPE_MERGULHO)[number];

export const equipeMergulhoSchema = z.object({
  letra: z.enum(LETRA_EQUIPE_MERGULHO),
  chefe: militarRefSchema.nullable(),
  motorista: militarRefSchema.nullable(),
  /** Mergulhadores adicionais (tipicamente 2). */
  mergulhadores: z.array(militarRefSchema),
});
export type EquipeMergulho = z.infer<typeof equipeMergulhoSchema>;

/**
 * Cadastro de equipes de Mergulho segregado por quinzena. O Sargenteante
 * monta uma matriz de cadastro independente para cada aba (1ª quinzena:
 * dias 1 a 13/14; 2ª quinzena: 14/15 ao último dia do mês). `ultimoDiaQ1`
 * é o último dia coberto pela 1ª aba.
 */
export const equipesMergulhoPorQuinzenaSchema = z.object({
  q1: z.record(z.enum(LETRA_EQUIPE_MERGULHO), equipeMergulhoSchema),
  q2: z.record(z.enum(LETRA_EQUIPE_MERGULHO), equipeMergulhoSchema),
  ultimoDiaQ1: z.number().int().min(13).max(14),
});
export type EquipesMergulhoPorQuinzena = z.infer<typeof equipesMergulhoPorQuinzenaSchema>;

export const escalaMergulhoMesSchema = z.object({
  /** Cadastro do mês, segregado por quinzena (X16:AI20 de cada aba). */
  equipesPorQuinzena: equipesMergulhoPorQuinzenaSchema,
  /**
   * Para cada `YYYY-MM-DD`, qual equipe (A/B/C) está em MERGULHO 01 e MERGULHO
   * 02. Códigos do XLSX `A1`/`A2` representam dia 1/2 do plantão da equipe A
   * — aqui simplificado para apenas a letra.
   */
  porDia: z.record(
    z.string(),
    z.object({
      mergulho01: z.enum(LETRA_EQUIPE_MERGULHO).optional(),
      mergulho02: z.enum(LETRA_EQUIPE_MERGULHO).optional(),
    }),
  ),
});
export type EscalaMergulhoMes = z.infer<typeof escalaMergulhoMesSchema>;

/**
 * S0.4 — Equipes de Salvamar (Pelotão de Atividades Aquáticas). Layout
 * paralelo às equipes de Mergulho, mas com 2 equipes (E/F) em vez de 3
 * (A/B/C) — letras escolhidas para não conflitar com as rotativas.
 *
 * Cadastro no XLSX (linhas 24-25): "Sup" (supervisor/chefe) por dia de
 * plantão. Cada equipe tem 1-2 supervisores. Schedule (linha 14): letra
 * "E" ou "F" por dia indicando qual equipe está em SALVAMAR.
 */
export const LETRA_EQUIPE_SALVAMAR = ['E', 'F'] as const;
export type LetraEquipeSalvamar = (typeof LETRA_EQUIPE_SALVAMAR)[number];

export const equipeSalvamarSchema = z.object({
  letra: z.enum(LETRA_EQUIPE_SALVAMAR),
  /** Supervisores da equipe — 1 ou 2 militares conforme o cadastro do mês. */
  supervisores: z.array(militarRefSchema),
});
export type EquipeSalvamar = z.infer<typeof equipeSalvamarSchema>;

/**
 * S0.4 — Cadastro de equipes de Salvamar segregado por quinzena. Mesma regra
 * do Mergulho: cada aba do XLSX tem seu próprio cadastro.
 */
export const equipesSalvamarPorQuinzenaSchema = z.object({
  q1: z.record(z.enum(LETRA_EQUIPE_SALVAMAR), equipeSalvamarSchema),
  q2: z.record(z.enum(LETRA_EQUIPE_SALVAMAR), equipeSalvamarSchema),
  ultimoDiaQ1: z.number().int().min(13).max(14),
});
export type EquipesSalvamarPorQuinzena = z.infer<typeof equipesSalvamarPorQuinzenaSchema>;

export const escalaSalvamarMesSchema = z.object({
  /** Cadastro do mês, segregado por quinzena (X23:AE25 de cada aba). */
  equipesPorQuinzena: equipesSalvamarPorQuinzenaSchema,
  /**
   * Para cada `YYYY-MM-DD`, qual equipe (E/F) está de plantão em
   * SALVAMAR. Dia sem entrada significa sem SALVAMAR previsto.
   */
  porDia: z.record(z.string(), z.enum(LETRA_EQUIPE_SALVAMAR)),
});
export type EscalaSalvamarMes = z.infer<typeof escalaSalvamarMesSchema>;

/**
 * Composição segregada por quinzena. O XLSX da SOS tem uma aba por quinzena
 * (1ª: dias 1 a 13/14; 2ª: 14/15 ao último dia do mês) e a composição de
 * cada posição (equipe × viatura × função) pode mudar entre quinzenas
 * (afastamentos, troca de função, escala especial). `ultimoDiaQ1` é o
 * último dia coberto pela 1ª aba e define a fronteira para resolução
 * dia→quinzena no service.
 */
export const composicaoPorQuinzenaSchema = z.object({
  q1: z.array(composicaoEntrySchema),
  q2: z.array(composicaoEntrySchema),
  ultimoDiaQ1: z.number().int().min(13).max(14),
});
export type ComposicaoPorQuinzena = z.infer<typeof composicaoPorQuinzenaSchema>;

export const escalaMensalSchema = z.object({
  /** 1-12 */
  mes: z.number().int().min(1).max(12),
  ano: z.number().int().min(2024).max(2100),
  origemArquivo: z.string(),
  /** ISO timestamp */
  importadoEm: z.string(),
  importadoPorNf: z.string().optional(),
  /** Mapa "YYYY-MM-DD" → letra da equipe rotativa (A/B/C/D) escalada nesse dia. */
  diaEquipe: z.record(z.string(), z.enum(LETRA_EQUIPE_ROTATIVA)),
  /** Lista de posições na matriz (equipe × viatura × função), segregada por quinzena. */
  composicaoPorQuinzena: composicaoPorQuinzenaSchema,
  /**
   * Seção de Mergulho (cadastro fixo + schedule por dia). Opcional — XLSX
   * sem essa seção (ex.: testes legados, dia da mulher) deixa `undefined`.
   */
  mergulho: escalaMergulhoMesSchema.optional(),
  /**
   * S0.4 — Seção de Salvamar (cadastro fixo + schedule por dia). Opcional
   * com o mesmo critério do mergulho.
   */
  salvamar: escalaSalvamarMesSchema.optional(),
  /** Lista de avisos não-fatais detectados durante o parse (NF não resolvido, célula vazia, etc.). */
  avisos: z.array(z.string()),
});
export type EscalaMensal = z.infer<typeof escalaMensalSchema>;

/**
 * Diff entre uma escala vigente e uma nova versão sendo importada.
 * Usado em reupload: dia/composição que mudou é apresentado para confirmação.
 */
const composicaoDiffEntrySchema = z.object({
  equipe: z.enum(LETRA_EQUIPE),
  viatura: z.string(),
  funcao: z.string(),
  antes: z.string().nullable(),
  depois: z.string().nullable(),
});

export const escalaDiffSchema = z.object({
  diasAlterados: z.array(
    z.object({
      data: z.string(),
      equipeAntes: z.enum(LETRA_EQUIPE_ROTATIVA).nullable(),
      equipeDepois: z.enum(LETRA_EQUIPE_ROTATIVA).nullable(),
    }),
  ),
  composicaoAlteradaPorQuinzena: z.object({
    q1: z.array(composicaoDiffEntrySchema),
    q2: z.array(composicaoDiffEntrySchema),
  }),
});
export type EscalaDiff = z.infer<typeof escalaDiffSchema>;

/**
 * S2.3 — Re-import com diff + bloqueios.
 *
 * Um dia "bloqueado" é aquele cuja Prévia já foi iniciada ou cujo Serviço
 * já está em andamento (estado != NAO_INICIADO no `ServicoService`). O
 * frontend deve listar esses dias antes de confirmar e o backend deve
 * rejeitar o `confirm` com 409 se houver qualquer bloqueio.
 *
 * Estratégia conservadora: bloqueio TOTAL — se algum dia da escala está em
 * uso, todo o save é rejeitado. User precisa "destravar" (cancelar Prévia
 * ou aguardar encerramento do Serviço) antes de poder reimportar.
 */
export const bloqueioReimportSchema = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  estado: z.string(),
  motivo: z.string(),
});
export type BloqueioReimport = z.infer<typeof bloqueioReimportSchema>;

export const previewEscalaResponseSchema = z.object({
  escala: escalaMensalSchema,
  diff: escalaDiffSchema.nullable(),
  bloqueios: z.array(bloqueioReimportSchema).default([]),
});
export type PreviewEscalaResponse = z.infer<typeof previewEscalaResponseSchema>;

/**
 * S2.8.2 — Re-import com diff seletivo por dia.
 *
 * Admin escolhe, para cada dia com diferença em relação à escala vigente,
 * se quer manter a versão atual (preserva) ou aceitar a versão nova
 * (sobrescreve). `diasDescartados` lista as datas em que o admin escolheu
 * MANTER o atual (default = aceitar tudo = lista vazia).
 */
export const confirmEscalaInputSchema = z.object({
  escala: escalaMensalSchema,
  diasDescartados: z
    .array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
    .optional()
    .default([]),
});
export type ConfirmEscalaInput = z.infer<typeof confirmEscalaInputSchema>;

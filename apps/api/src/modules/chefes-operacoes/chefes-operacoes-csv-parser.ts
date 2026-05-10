import { parse } from 'csv-parse/sync';
import type { ChefeOperacoes } from '@argus/shared-types';

/**
 * Layout esperado da planilha de Escala de Chefe de Operações
 * (gid 1250546399 da spreadsheet `1Nlr_uSNVD6dByaWPTL6IttSOa2nQPXO-m7FqTpeH8WI`):
 *
 * Linhas 1-5: cabeçalhos institucionais (mês, "ESCALA DE CHEFE DE OPERAÇÕES").
 * Linha 6:    `#,Nº,ANT,POSTO,NOME DE GUERRA,TELEFONE,NF,1,2,3,...,31,EDOCs,FÉRIAS,U,F,S,TOTAL`
 * Linhas 7+:  dados — `Nº` numérico em col 1, dia 1..31 em cols 7..37 com marcadores X/Y/S/*.
 *
 * Posições (0-indexed):
 *   col 0:  # (qtd, ignorar)
 *   col 1:  Nº (sequencial)
 *   col 2:  ANT (antiguidade)
 *   col 3:  POSTO (CAP QOC, 1ºTEN QOA, etc.)
 *   col 4:  NOME DE GUERRA
 *   col 5:  TELEFONE
 *   col 6:  NF
 *   cols 7..37: dia 1..31 (marcadores X/Y/S/* indicam escalado)
 *
 * Linhas com `Nº` vazio ou não numérico são separadores/totais — ignoradas.
 */

interface ParsedChefe {
  posto: string;
  nomeGuerra: string;
  nf: string;
  telefone?: string;
  /** Marcadores por dia (1-31). Vazio = não escalado. */
  porDia: Map<number, string>;
}

const HEADER_TOKEN = 'NOME DE GUERRA';
const COL_NUM = 1;
const COL_POSTO = 3;
const COL_NOME_GUERRA = 4;
const COL_TELEFONE = 5;
const COL_NF = 6;
const COL_DIA1 = 7; // dia 1 = col 7; dia D = col 7 + (D-1)

export function parseChefesOperacoesCsv(csv: string): ParsedChefe[] {
  let rows: string[][];
  try {
    rows = parse(csv, {
      skip_empty_lines: false,
      relax_quotes: true,
      relax_column_count: true,
    }) as string[][];
  } catch (err) {
    throw new Error(`CSV inválido: ${(err as Error).message}`, { cause: err });
  }

  // Encontra a linha do cabeçalho
  const headerIdx = rows.findIndex((r) => (r[COL_NOME_GUERRA] ?? '').trim() === HEADER_TOKEN);
  if (headerIdx < 0) {
    throw new Error(`Cabeçalho "${HEADER_TOKEN}" não encontrado no CSV de ChOp.`);
  }

  const out: ParsedChefe[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const num = (row[COL_NUM] ?? '').trim();
    if (!/^\d+$/.test(num)) continue; // separadores ou linhas de total

    const nf = (row[COL_NF] ?? '').trim();
    const posto = (row[COL_POSTO] ?? '').trim();
    const nomeGuerra = (row[COL_NOME_GUERRA] ?? '').trim();
    if (!nf || !posto || !nomeGuerra) continue;

    const telefone = normalizeTelefone((row[COL_TELEFONE] ?? '').trim());

    const porDia = new Map<number, string>();
    for (let dia = 1; dia <= 31; dia++) {
      const v = (row[COL_DIA1 + (dia - 1)] ?? '').trim();
      if (v && v.length > 0) porDia.set(dia, v);
    }

    out.push({ posto, nomeGuerra, nf, telefone: telefone || undefined, porDia });
  }
  return out;
}

/** Retorna chefes escalados (com qualquer marcador) num dia específico. */
export function chefesDoDia(parsed: ParsedChefe[], dia: number): ChefeOperacoes[] {
  const result: ChefeOperacoes[] = [];
  for (const c of parsed) {
    const marcador = c.porDia.get(dia);
    if (!marcador) continue;
    // Marcadores que indicam ausência (não escalado) — filtrar:
    // CURSO/FÉRIAS/etc. são strings inteiras (não X/Y/S/*); marcadores válidos têm 1 char ou *
    const isEscalado = /^[XYS*]$/.test(marcador);
    if (!isEscalado) continue;
    result.push({
      posto: c.posto,
      nomeGuerra: c.nomeGuerra,
      nf: c.nf,
      telefone: c.telefone,
      marcador,
    });
  }
  return result;
}

function normalizeTelefone(raw: string): string {
  // Remove espaços, mas preserva o formato. Ex.: "27 996002598" → "27996002598".
  return raw.replace(/\s+/g, '');
}

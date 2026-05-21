import { parse } from 'csv-parse/sync';
import type { ChefeOperacoes } from '@argus/shared-types';

/**
 * Layout esperado da planilha de Escala de Chefe de Operações
 * (spreadsheet `1Nlr_uSNVD6dByaWPTL6IttSOa2nQPXO-m7FqTpeH8WI`, abas por mês):
 *
 * Linhas 1-5: cabeçalhos institucionais (mês, "ESCALA DE CHEFE DE OPERAÇÕES").
 *             Em alguma das primeiras 5 linhas aparece o nome do mês por extenso
 *             (ex: "MÊS DE ABRIL DE 2026" ou "ABRIL 2026").
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

export interface ParseChefesOptions {
  /**
   * S2.10.11b — Fallback de ano/mes quando o parser não conseguir extrair
   * do cabeçalho institucional. Tipicamente derivado do nome da aba
   * (ex: 'ABRIL 2026' → `{ano: 2026, mes: 4}`).
   */
  defaultAno?: number;
  defaultMes?: number;
}

export interface ParsedChefesCsv {
  ano: number;
  mes: number;
  militares: ParsedChefe[];
}

const HEADER_TOKEN = 'NOME DE GUERRA';
const COL_NUM = 1;
const COL_POSTO = 3;
const COL_NOME_GUERRA = 4;
const COL_TELEFONE = 5;
const COL_NF = 6;
const COL_DIA1 = 7; // dia 1 = col 7; dia D = col 7 + (D-1)

const MESES_PT: Record<string, number> = {
  JANEIRO: 1,
  JAN: 1,
  FEVEREIRO: 2,
  FEV: 2,
  MARÇO: 3,
  MARCO: 3,
  MAR: 3,
  ABRIL: 4,
  ABR: 4,
  MAIO: 5,
  MAI: 5,
  JUNHO: 6,
  JUN: 6,
  JULHO: 7,
  JUL: 7,
  AGOSTO: 8,
  AGO: 8,
  SETEMBRO: 9,
  SET: 9,
  OUTUBRO: 10,
  OUT: 10,
  NOVEMBRO: 11,
  NOV: 11,
  DEZEMBRO: 12,
  DEZ: 12,
};

/**
 * S2.10.11b — Tenta extrair `(ano, mes)` das primeiras N linhas do CSV.
 *
 * Procura mês e ano em **qualquer célula** das primeiras 8 linhas, mesmo
 * em células separadas. A planilha institucional real tem mês ("MAIO")
 * em uma célula e o ano ("2026") em outra (ou no nome da aba), por isso
 * não exige que estejam juntos.
 *
 * Aceita formatos como:
 *   "MÊS DE ABRIL DE 2026"
 *   "ABRIL 2026"
 *   "JAN/2026"
 *   "MAIO" + outra célula "2026"
 *
 * Retorna `null` se mês ou ano faltarem nas primeiras 8 linhas.
 */
function extractAnoMesFromHeader(rows: string[][]): {
  ano: number | null;
  mes: number | null;
} {
  const SCAN_ROWS = Math.min(rows.length, 8);
  let mes: number | null = null;
  let ano: number | null = null;
  for (let r = 0; r < SCAN_ROWS; r++) {
    const cells = rows[r] ?? [];
    for (const cell of cells) {
      const upper = stripAccents(String(cell ?? ''))
        .toUpperCase()
        .trim();
      if (!upper) continue;
      if (mes === null) {
        for (const mesToken of Object.keys(MESES_PT)) {
          const re = new RegExp(`\\b${mesToken}\\b`);
          if (re.test(upper)) {
            mes = MESES_PT[mesToken]!;
            break;
          }
        }
      }
      if (ano === null) {
        const anoMatch = upper.match(/\b(20\d{2})\b/);
        if (anoMatch) ano = Number.parseInt(anoMatch[1]!, 10);
      }
      if (mes !== null && ano !== null) return { ano, mes };
    }
  }
  return { ano, mes };
}

/** Remove combining diacritics (U+0300..U+036F). */
function stripAccents(s: string): string {
  // U+0300..U+036F = combining diacritical marks
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function parseChefesOperacoesCsv(
  csv: string,
  options: ParseChefesOptions = {},
): ParsedChefesCsv {
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

  // S2.10.11b — Extrai ano/mes do cabeçalho. Cada componente pode vir do
  // header (mês geralmente está; ano às vezes não) ou de defaults
  // (tipicamente derivados do nome da aba pelo ImportService).
  const fromHeader = extractAnoMesFromHeader(rows);
  const ano = fromHeader.ano ?? options.defaultAno;
  const mes = fromHeader.mes ?? options.defaultMes;
  if (!ano || !mes) {
    throw new Error(
      'Não foi possível determinar ano/mes da planilha ChOp. Cabeçalho não contém mês/ano reconhecível e nenhum default foi fornecido.',
    );
  }

  // Encontra a linha do cabeçalho de colunas
  const headerIdx = rows.findIndex((r) => (r[COL_NOME_GUERRA] ?? '').trim() === HEADER_TOKEN);
  if (headerIdx < 0) {
    throw new Error(`Cabeçalho "${HEADER_TOKEN}" não encontrado no CSV de ChOp.`);
  }

  const militares: ParsedChefe[] = [];
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

    militares.push({ posto, nomeGuerra, nf, telefone: telefone || undefined, porDia });
  }
  return { ano, mes, militares };
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

/**
 * S2.10.11b — Tenta extrair `(ano, mes)` do nome de uma aba (`'ABRIL 2026'`,
 * `'JAN/2026'`, `'2026-04 ABRIL'`, etc.). Usado pelo ImportService como
 * fallback antes de chamar o parser.
 */
export function parseAnoMesFromSheetName(name: string): { ano: number; mes: number } | null {
  const upper = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  const anoMatch = upper.match(/\b(20\d{2})\b/);
  if (!anoMatch) return null;
  for (const mesToken of Object.keys(MESES_PT)) {
    if (upper.includes(mesToken)) {
      return { ano: Number.parseInt(anoMatch[1]!, 10), mes: MESES_PT[mesToken]! };
    }
  }
  // Fallback: 2026-04 ou 2026/04
  const mesNum = upper.match(/\b20\d{2}[-/](\d{1,2})\b/);
  if (mesNum) {
    const m = Number.parseInt(mesNum[1]!, 10);
    if (m >= 1 && m <= 12) {
      return { ano: Number.parseInt(anoMatch[1]!, 10), mes: m };
    }
  }
  return null;
}

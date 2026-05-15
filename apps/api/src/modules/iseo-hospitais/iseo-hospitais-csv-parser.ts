import { parse } from 'csv-parse/sync';
import type { IseoHospitalEntry, IseoHospitalUnidade, IseoHospitalTurno } from '@argus/shared-types';

/**
 * Layout da planilha "Escala ISEO Hospitais"
 * (https://docs.google.com/spreadsheets/d/1wmFOEsrU219fGMfksoSY5dvQu0UN7HdQ558UUiWRXuw/).
 *
 * Cada aba representa um período (ex.: `HPM JANEIRO 2026`, `HIMABA JANEIRO 2026`,
 * `ABRIL 2026`). A unidade pode vir do nome da aba (`unidadeFromSheet`) OU,
 * em abas unificadas (sem prefixo HPM/HIMABA), da coluna `OBM` linha-a-linha.
 *
 * Cabeçalho na linha 1:
 *   `POSTO/GRAD,NOME DO MILITAR,NF,DATA DA ESCALA,TURNO,FUNÇÃO,CONTATO,CARGA HORÁRIA,OBM,LOTAÇÃO`
 *
 * Linhas com NF vazia, data inválida ou unidade não-resolvida são descartadas.
 */

/**
 * Tokens que devem aparecer no header. NF é sinônimo de MATRÍCULA (algumas
 * abas mais novas usam "MATRÍCULA" no lugar de "NF").
 */
const HEADER_TOKENS_REQUIRED = ['POSTO', 'NOME', 'DATA'];
const HEADER_TOKENS_NF_OR_MATRICULA = ['NF', 'MATRICULA'];

export interface ParseIseoHospitaisOptions {
  /** Unidade fixa quando o nome da aba já discrimina (ex.: "HPM JANEIRO 2026"). */
  unidadeFromSheet?: IseoHospitalUnidade;
  /**
   * Default usado em abas unificadas (ex.: "ABRIL 2026") quando a coluna OBM
   * está ausente E o nome da aba não traz prefixo HPM/HIMABA. Se omitido, a
   * linha é descartada nesse caso.
   */
  unidadeDefault?: IseoHospitalUnidade;
}

/**
 * Classifica o nome da aba: se começa com "HPM " ou "HIMABA " retorna a
 * unidade; caso contrário retorna `undefined` (a aba é unificada e a
 * unidade vem da coluna OBM).
 */
export function parseUnidadeFromSheetName(sheetName: string): IseoHospitalUnidade | undefined {
  const n = normalize(sheetName);
  if (n.startsWith('HPM ') || n === 'HPM') return 'HPM';
  if (n.startsWith('HIMABA ') || n === 'HIMABA') return 'HIMABA';
  return undefined;
}

export function parseIseoHospitaisCsv(
  csv: string,
  opts: ParseIseoHospitaisOptions = {},
): IseoHospitalEntry[] {
  let rows: string[][];
  try {
    rows = parse(csv, {
      skip_empty_lines: false,
      relax_quotes: true,
      relax_column_count: true,
      bom: true,
    }) as string[][];
  } catch (err) {
    throw new Error(`CSV inválido: ${(err as Error).message}`, { cause: err });
  }

  const headerIdx = findHeaderIndex(rows);
  if (headerIdx < 0) {
    throw new Error('Cabeçalho não encontrado (esperado POSTO/GRAD + NOME + NF + DATA).');
  }

  const header = rows[headerIdx]!.map(normalize);
  const colPosto = findCol(header, ['POSTO', 'GRADUACAO', 'GRAD']);
  const colNome = findCol(header, ['NOME']);
  const colNf = findCol(header, ['NF', 'MATRICULA']);
  const colData = findCol(header, ['DATA']);
  const colTurno = findCol(header, ['TURNO']);
  const colFuncao = findCol(header, ['FUNCAO', 'FUNÇÃO']);
  const colContato = findCol(header, ['CONTATO', 'TELEFONE']);
  const colCarga = findCol(header, ['CARGA']);
  const colObm = findCol(header, ['OBM']);
  const colLotacao = findCol(header, ['LOTACAO', 'LOTAÇÃO']);

  if (colPosto < 0 || colNome < 0 || colNf < 0 || colData < 0 || colTurno < 0) {
    throw new Error('Colunas obrigatórias ausentes (POSTO, NOME, NF/MATRÍCULA, DATA, TURNO).');
  }

  // Detecta se a aba tem 2 militares lado a lado (ABRIL 2026 em diante):
  // procura uma SEGUNDA matrícula numérica nas colunas após `colNf`.
  // Se houver, extrai também (posto+nome) do segundo bloco.
  const colNf2 = findSecondNfColumn(rows, headerIdx, colNf);

  const out: IseoHospitalEntry[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];

    const dataRaw = clean(row[colData]);
    const dataIso = parseDataBR(dataRaw);
    if (!dataIso) continue;

    const turno = parseTurno(clean(row[colTurno]));
    if (!turno) continue;

    const obm = colObm >= 0 ? clean(row[colObm]) || undefined : undefined;
    const unidade =
      opts.unidadeFromSheet ?? inferUnidadeFromObm(obm) ?? opts.unidadeDefault;
    if (!unidade) continue;

    const funcao = colFuncao >= 0 ? clean(row[colFuncao]) || undefined : undefined;
    const cargaHoraria = colCarga >= 0 ? clean(row[colCarga]) || undefined : undefined;
    const lotacao = colLotacao >= 0 ? clean(row[colLotacao]) || undefined : undefined;
    const postoCompartilhado = clean(row[colPosto]);

    // 1º militar.
    const nf1 = clean(row[colNf]);
    const nome1 = clean(row[colNome]);
    if (/^\d+$/.test(nf1) && nome1) {
      const { posto, nome } = splitPostoNome(nome1, postoCompartilhado);
      if (posto && nome) {
        out.push({
          unidade,
          posto,
          nome,
          nf: nf1,
          dataIso,
          turno,
          funcao,
          contato: colContato >= 0 ? clean(row[colContato]) || undefined : undefined,
          cargaHoraria,
          obm,
          lotacao,
        });
      }
    }

    // 2º militar (apenas se o layout tiver 2 colunas de matrícula).
    if (colNf2 >= 0) {
      const nf2 = clean(row[colNf2]);
      const nome2 = clean(row[colNf2 + 1]);
      const contato2 = clean(row[colNf2 + 2]) || undefined;
      if (/^\d+$/.test(nf2) && nome2) {
        const { posto, nome } = splitPostoNome(nome2, postoCompartilhado);
        if (posto && nome) {
          out.push({
            unidade,
            posto,
            nome,
            nf: nf2,
            dataIso,
            turno,
            funcao,
            contato: contato2,
            cargaHoraria,
            obm,
            lotacao,
          });
        }
      }
    }
  }
  return out;
}

/**
 * Procura uma segunda coluna de "matrícula" (numérica) à direita da primeira.
 * Em layouts pareados (ABRIL/MAIO 2026), o cabeçalho repete "MATRÍCULA" e
 * "NOME DO MILITAR" para o 2º militar. Como `findCol` retorna a primeira
 * ocorrência, varremos manualmente o resto do header.
 */
function findSecondNfColumn(rows: string[][], headerIdx: number, colNf: number): number {
  const header = (rows[headerIdx] ?? []).map(normalize);
  for (let c = colNf + 1; c < header.length; c++) {
    const cell = header[c] ?? '';
    if (cell.includes('MATRICULA') || cell === 'NF') return c;
  }
  return -1;
}

/**
 * O nome no XLSX vem como "2ºSGT BARCELLOS" (posto embebido) ou apenas
 * "BARCELLOS" (posto separado em `colPosto`). Tenta separar; se não der,
 * usa `postoFallback` (do header da linha).
 */
function splitPostoNome(
  raw: string,
  postoFallback: string,
): { posto: string; nome: string } {
  const re =
    /^(?<posto>(?:[1-3]º\s*)?(?:CEL|TEN\s*CEL|MAJ|CAP|TEN(?:\s+QOC)?|SUB\s*TEN|SGT|CB|SD|AL))\s+(?<nome>.+)$/i;
  const m = raw.match(re);
  if (m?.groups) {
    return {
      posto: m.groups.posto.replace(/\s+/g, '').toUpperCase(),
      nome: m.groups.nome.trim(),
    };
  }
  return { posto: postoFallback, nome: raw };
}

function inferUnidadeFromObm(obm: string | undefined): IseoHospitalUnidade | undefined {
  if (!obm) return undefined;
  const n = normalize(obm);
  if (n.includes('HPM')) return 'HPM';
  if (n.includes('HIMABA')) return 'HIMABA';
  return undefined;
}

function findHeaderIndex(rows: string[][]): number {
  // Procura nas 10 primeiras linhas (algumas abas têm título institucional + linha vazia + header).
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const normalized = (rows[i] ?? []).map(normalize);
    const hasRequired = HEADER_TOKENS_REQUIRED.every((tok) =>
      normalized.some((cell) => cell.includes(tok)),
    );
    const hasNfOrMatricula = HEADER_TOKENS_NF_OR_MATRICULA.some((tok) =>
      normalized.some((cell) => cell.includes(tok)),
    );
    if (hasRequired && hasNfOrMatricula) return i;
  }
  return -1;
}

function findCol(header: string[], candidates: string[]): number {
  for (let i = 0; i < header.length; i++) {
    const cell = header[i] ?? '';
    for (const c of candidates) {
      if (cell.includes(normalize(c))) return i;
    }
  }
  return -1;
}

function normalize(s: string | undefined | null): string {
  return (s ?? '')
    .toString()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .trim();
}

function clean(s: string | undefined | null): string {
  return (s ?? '').toString().trim();
}

function parseDataBR(raw: string): string | null {
  // Aceita DD/MM/YYYY ou DD-MM-YYYY ou YYYY-MM-DD.
  const m1 = raw.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (m1) {
    const [, dd, mm, yyyy] = m1;
    return `${yyyy}-${mm}-${dd}`;
  }
  const m2 = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m2) return raw;
  return null;
}

function parseTurno(raw: string): IseoHospitalTurno | null {
  const n = normalize(raw);
  if (n.startsWith('DIU')) return 'Diurno';
  if (n.startsWith('NOT')) return 'Noturno';
  return null;
}

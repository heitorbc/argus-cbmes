import { parse } from 'csv-parse/sync';
import type { IseoHospitalEntry, IseoHospitalUnidade, IseoHospitalTurno } from '@argus/shared-types';

/**
 * Layout da planilha "Escala ISEO Hospitais"
 * (https://docs.google.com/spreadsheets/d/1wmFOEsrU219fGMfksoSY5dvQu0UN7HdQ558UUiWRXuw/).
 *
 * Cada gid representa UMA unidade (HPM ou HIMABA). A unidade é injetada
 * pelo serviço (parâmetro `unidade`), não vem dentro do CSV.
 *
 * Cabeçalho na linha 1:
 *   `POSTO/GRAD,NOME DO MILITAR,NF,DATA DA ESCALA,TURNO,FUNÇÃO,CONTATO,CARGA HORÁRIA,OBM,LOTAÇÃO`
 *
 * Linhas com NF vazia ou data inválida são descartadas.
 */

const HEADER_TOKENS = ['POSTO', 'NOME', 'NF', 'DATA'];

export interface ParseIseoHospitaisOptions {
  unidade: IseoHospitalUnidade;
}

export function parseIseoHospitaisCsv(
  csv: string,
  opts: ParseIseoHospitaisOptions,
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
  const colNf = findCol(header, ['NF']);
  const colData = findCol(header, ['DATA']);
  const colTurno = findCol(header, ['TURNO']);
  const colFuncao = findCol(header, ['FUNCAO', 'FUNÇÃO']);
  const colContato = findCol(header, ['CONTATO', 'TELEFONE']);
  const colCarga = findCol(header, ['CARGA']);
  const colObm = findCol(header, ['OBM']);
  const colLotacao = findCol(header, ['LOTACAO', 'LOTAÇÃO']);

  if (colPosto < 0 || colNome < 0 || colNf < 0 || colData < 0 || colTurno < 0) {
    throw new Error('Colunas obrigatórias ausentes (POSTO, NOME, NF, DATA, TURNO).');
  }

  const out: IseoHospitalEntry[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const nf = clean(row[colNf]);
    if (!/^\d+$/.test(nf)) continue;

    const dataRaw = clean(row[colData]);
    const dataIso = parseDataBR(dataRaw);
    if (!dataIso) continue;

    const turno = parseTurno(clean(row[colTurno]));
    if (!turno) continue;

    const posto = clean(row[colPosto]);
    const nome = clean(row[colNome]);
    if (!posto || !nome) continue;

    out.push({
      unidade: opts.unidade,
      posto,
      nome,
      nf,
      dataIso,
      turno,
      funcao: colFuncao >= 0 ? clean(row[colFuncao]) || undefined : undefined,
      contato: colContato >= 0 ? clean(row[colContato]) || undefined : undefined,
      cargaHoraria: colCarga >= 0 ? clean(row[colCarga]) || undefined : undefined,
      obm: colObm >= 0 ? clean(row[colObm]) || undefined : undefined,
      lotacao: colLotacao >= 0 ? clean(row[colLotacao]) || undefined : undefined,
    });
  }
  return out;
}

function findHeaderIndex(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const normalized = (rows[i] ?? []).map(normalize);
    const hits = HEADER_TOKENS.filter((tok) =>
      normalized.some((cell) => cell.includes(tok)),
    ).length;
    if (hits >= HEADER_TOKENS.length) return i;
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

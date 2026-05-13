import type { ViaturaQdv } from '@argus/shared-types';

/**
 * Parser do CSV da aba "1BBM_1CIA" da planilha QDV (item 3).
 *
 * Layout:
 *   Linha 0: "ATUALIZADO EM:", "DD/MM/AAAA", "OBM", "1ºBBM/1ªCIA", ...
 *   Linha 1: "RESPONSÁVEL", "NF:", NF, NOME, "TELEFONE:", TELEFONE, EMAIL...
 *   Linha 2: header das colunas — "PREFIXO" no col 0, etc.
 *   Linha 3+: dados das viaturas
 *
 * Para encontrar as colunas, varremos a linha 2 procurando os títulos
 * conhecidos (PREFIXO, STATUS, KM ATUAL, etc.) e usamos o índice da
 * coluna como referência.
 */
const COLUNAS_CONHECIDAS = [
  'PREFIXO',
  'STATUS',
  'EMPRESTADA A:',
  'KM ATUAL',
  'OBS',
  'EMPREGO PRIMÁRIO',
  'EMPREGO SECUNDÁRIO',
  'PLACA',
  'MARCA / MODELO',
  'TIPO DO COMBUSTÍVEL',
] as const;

type ColMap = Partial<Record<(typeof COLUNAS_CONHECIDAS)[number], number>>;

export function parseViaturasQdvCsv(csv: string): ViaturaQdv[] {
  const linhas = parseCsvRobust(csv);
  if (linhas.length < 4) return [];

  // A 3ª linha (idx 2) costuma ser o header. Mas alguns CSVs podem ter
  // espaços extras — varremos até encontrar a primeira linha com "PREFIXO".
  let headerIdx = -1;
  for (let i = 0; i < Math.min(linhas.length, 10); i += 1) {
    if ((linhas[i] ?? []).some((c) => c.trim().toUpperCase() === 'PREFIXO')) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) return [];

  const header = linhas[headerIdx]!;
  const colMap: ColMap = {};
  for (let c = 0; c < header.length; c += 1) {
    const cell = header[c]!.trim().toUpperCase();
    for (const known of COLUNAS_CONHECIDAS) {
      if (cell === known) {
        colMap[known] = c;
      }
    }
  }

  // OBM frequentemente é a última coluna não-header — pegar o último valor não-vazio.
  const out: ViaturaQdv[] = [];
  for (let r = headerIdx + 1; r < linhas.length; r += 1) {
    const cols = linhas[r]!;
    const prefixo = colMap.PREFIXO !== undefined ? (cols[colMap.PREFIXO] ?? '').trim() : '';
    if (!prefixo) continue;

    const get = (key: keyof ColMap): string | undefined => {
      const idx = colMap[key];
      if (idx === undefined) return undefined;
      const v = (cols[idx] ?? '').trim();
      return v || undefined;
    };
    const kmText = get('KM ATUAL');
    const kmAtual = kmText ? Number(kmText.replace(/\./g, '').replace(/,/g, '')) : undefined;

    // OBM = última coluna não-vazia da linha (heurística)
    let obm: string | undefined;
    for (let c = cols.length - 1; c >= 0; c -= 1) {
      const v = (cols[c] ?? '').trim();
      if (v && /BBM|CIA|BBM\/|\/\d/.test(v)) {
        obm = v;
        break;
      }
    }

    out.push({
      prefixo,
      status: get('STATUS'),
      emprestadaA: get('EMPRESTADA A:'),
      kmAtual: Number.isFinite(kmAtual) ? kmAtual : undefined,
      observacao: get('OBS'),
      empregoPrimario: get('EMPREGO PRIMÁRIO'),
      empregoSecundario: get('EMPREGO SECUNDÁRIO'),
      placa: get('PLACA'),
      marcaModelo: get('MARCA / MODELO'),
      combustivel: get('TIPO DO COMBUSTÍVEL'),
      obm,
    });
  }
  return out;
}

function parseCsvRobust(csv: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  while (i < csv.length) {
    const ch = csv[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (csv[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      row.push(field);
      field = '';
      i += 1;
      continue;
    }
    if (ch === '\n' || ch === '\r') {
      row.push(field);
      out.push(row);
      row = [];
      field = '';
      if (ch === '\r' && csv[i + 1] === '\n') i += 2;
      else i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    out.push(row);
  }
  return out;
}

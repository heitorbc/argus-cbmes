import type { TipoDispensa } from '@argus/shared-types';

/**
 * S2.10.7d — Parser da planilha "Efetivo - Dados Gerais", aba "Dispensas 2026".
 *
 * Layout por bloco mensal (19 colunas):
 *   A: NF | B: NOME | C: DATA (DD/MM/AAAA) | D: EDOCS | E: EQUIPE
 *   F: I | G: II | H: III | I: IV | J: V | K: VI | L: VII | M: VIII | N: IX (OUTRAS)
 *   O: OBS | P: MINUTA (Nº BG) | Q: (vazio) | R-S: (legenda/vazio)
 *
 * Posição confirmada via inspeção do CSV exportado em 2026-05-18.
 *
 * Cada linha pode preencher MÚLTIPLAS colunas de tipo (F-N) com dias — gera
 * uma `DispensaImportadaLinha` por tipo preenchido (D1 do plano S2.10.7d).
 *
 * Headers de mês ("JANEIRO", "FEVEREIRO", …) separam blocos. Linhas de
 * legenda dos primeiros 9 meses (col S/T = "I/TAF", "II/SAUDE", …) são
 * ignoradas via heurística de "sem dados em A-O".
 */

/** Tipo de dispensa por posição de coluna F..N (0-indexed dentro do slice F-N). */
const TIPO_POR_COLUNA: readonly TipoDispensa[] = [
  'I_TAF', // F (col 5 1-indexed)
  'II_EXAME', // G
  'III_INOVACAO', // H
  'IV_INSTRUCAO', // I
  'V_ANIVERSARIO', // J
  'VI_ASSIDUIDADE', // K
  'VII_MERITO', // L
  'VIII_DIVERSAS', // M
  'IX_OUTRAS', // N
];

const MESES_HEADER = new Set([
  'JANEIRO',
  'FEVEREIRO',
  'MARÇO',
  'MARCO',
  'ABRIL',
  'MAIO',
  'JUNHO',
  'JULHO',
  'AGOSTO',
  'SETEMBRO',
  'OUTUBRO',
  'NOVEMBRO',
  'DEZEMBRO',
]);

/** 1 entry da planilha (representa 1 dispensa por militar/data/tipo). */
export interface DispensaImportadaLinha {
  nfRaw?: string; // col A (vazio se sem NF — depende de NomeMatcher)
  militarRaw: string; // col B (Posto + Nome de Guerra)
  data: string; // ISO YYYY-MM-DD
  edocs?: string; // col D — texto livre ("2026-…", "OK", "S/ EDOCS", "")
  equipe?: string; // col E — A/B/C/D ou texto livre
  tipo: TipoDispensa;
  dias: number; // valor da coluna F..N correspondente ao tipo
  observacoes?: string; // col O (OBS)
  minuta?: string; // col Q (Nº BG)
}

/**
 * Faz parsing do CSV exportado pela planilha. Retorna 1 entry por
 * (linha de dado × coluna de tipo preenchida). Linhas sem nome/data ou
 * sem nenhum tipo preenchido são descartadas. Erros de data inválida
 * geram skip silencioso (caller pode validar via tamanho do array).
 */
export function parseDispensas2026Csv(csv: string, anoDefault: number): DispensaImportadaLinha[] {
  const rows = parseCsvRobust(csv);
  const out: DispensaImportadaLinha[] = [];

  for (const row of rows) {
    // Skip linhas vazias ou de header de mês
    if (!row || row.length < 14) continue;
    const colB = (row[1] ?? '').trim();
    const colC = (row[2] ?? '').trim();
    if (!colB) continue;

    // Pula header de mês ("JANEIRO" na coluna B sem outros dados)
    if (MESES_HEADER.has(colB.toUpperCase())) continue;

    // Pula header de tabela ("NOME" na col B com "EDOCS" na col D)
    if (colB.toUpperCase() === 'NOME') continue;

    // Pula linhas sem data (legendas, totalizadores, etc.)
    if (!colC) continue;

    const nfRaw = onlyDigits(row[0] ?? '');
    const edocs = (row[3] ?? '').trim();
    const equipe = (row[4] ?? '').trim();
    const observacoes = (row[14] ?? '').trim(); // col O
    const minuta = (row[15] ?? '').trim(); // col P

    const dataIso = brDateToIso(colC, anoDefault);
    if (!dataIso) continue; // data inválida — skip

    // S2.10.7e — Sequenciamento de tipos: quando uma linha tem múltiplos
    // tipos preenchidos (F..N), cada próxima dispensa começa QUANDO a
    // anterior termina (dataInicio_próxima = dataInicio_atual + dias_atual).
    // Exemplo (caso prático Tech Lead — JARDEL 04/01 com VI=6 e VII=2):
    //   VI: dataInicio=2026-01-04, dias=6 → cobre 04-09/01
    //   VII: dataInicio=2026-01-10, dias=2 → cobre 10-11/01
    let dataAcumulada = dataIso;
    for (let i = 0; i < TIPO_POR_COLUNA.length; i++) {
      const valorRaw = (row[5 + i] ?? '').trim();
      if (!valorRaw) continue;
      const dias = Number.parseInt(valorRaw, 10);
      if (!Number.isFinite(dias) || dias <= 0) continue;
      out.push({
        nfRaw: nfRaw || undefined,
        militarRaw: colB,
        data: dataAcumulada,
        edocs: edocs || undefined,
        equipe: equipe || undefined,
        tipo: TIPO_POR_COLUNA[i]!,
        dias,
        observacoes: observacoes || undefined,
        minuta: minuta || undefined,
      });
      dataAcumulada = addDaysIso(dataAcumulada, dias);
    }
  }

  return out;
}

/**
 * S2.10.7e — Soma `days` dias corridos a uma data ISO `YYYY-MM-DD` sem
 * problemas de fuso horário (usa UTC explícito).
 */
function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map((s) => Number.parseInt(s, 10));
  const date = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function onlyDigits(raw: string): string {
  return raw.trim().replace(/\D/g, '');
}

/**
 * Converte "DD/MM/AAAA" ou "DD/MM" → "AAAA-MM-DD". No segundo caso usa
 * `anoDefault` como fallback. Retorna `null` em formato inválido.
 */
function brDateToIso(input: string, anoDefault: number): string | null {
  const trimmed = input.trim();
  const mFull = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (mFull) {
    const [, d, mo, y] = mFull;
    return `${y}-${mo!.padStart(2, '0')}-${d!.padStart(2, '0')}`;
  }
  const mShort = /^(\d{1,2})\/(\d{1,2})$/.exec(trimmed);
  if (mShort) {
    const [, d, mo] = mShort;
    return `${anoDefault}-${mo!.padStart(2, '0')}-${d!.padStart(2, '0')}`;
  }
  return null;
}

/**
 * CSV parser tolerante a aspas e vírgulas dentro de campos. Copiado do
 * padrão estabelecido em `trocas-autorizadas-csv-parser.ts:124-176`.
 */
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

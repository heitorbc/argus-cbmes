import ExcelJS from 'exceljs';
import {
  type ComposicaoEntry,
  type EscalaMensal,
  type LetraEquipe,
  LETRA_EQUIPE,
  type MilitarRef,
} from '@argus/shared-types';

/**
 * Erro de parse — distingue rejeições "esperadas" (não-escala) de erros de runtime.
 */
export class EscalaXlsxParseError extends Error {
  constructor(
    message: string,
    readonly code: 'NOME_INVALIDO' | 'ABAS_AUSENTES' | 'LAYOUT_INVALIDO' | 'ARQUIVO_CORROMPIDO',
  ) {
    super(message);
    this.name = 'EscalaXlsxParseError';
  }
}

const MES_PT_TO_NUM: Record<string, number> = {
  JAN: 1,
  JANEIRO: 1,
  FEV: 2,
  FEVEREIRO: 2,
  MAR: 3,
  MARCO: 3,
  MARÇO: 3,
  ABR: 4,
  ABRIL: 4,
  MAI: 5,
  MAIO: 5,
  JUN: 6,
  JUNHO: 6,
  JUL: 7,
  JULHO: 7,
  AGO: 8,
  AGOSTO: 8,
  SET: 9,
  SETEMBRO: 9,
  OUT: 10,
  OUTUBRO: 10,
  NOV: 11,
  NOVEMBRO: 11,
  DEZ: 12,
  DEZEMBRO: 12,
};

const MES_NUM_TO_FULL = [
  '',
  'JANEIRO',
  'FEVEREIRO',
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
];

/**
 * Identifica mês/ano a partir do nome do arquivo. Aceita "MM MES DE AAAA.xlsx" e variantes.
 * Ex.: "05 MAIO DE 2026.xlsx", "02 FEVEREIRO DE 2026 - apos mergulho voltar.xlsx",
 * "05 MAIO DE 2026 11 A 15.xlsx" → todos retornam {mes:5, ano:2026}.
 */
export function parseFilename(filename: string): { mes: number; ano: number } {
  const norm = filename.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const matchAno = norm.match(/(20\d{2})/);
  if (!matchAno) {
    throw new EscalaXlsxParseError(
      `Nome do arquivo "${filename}" não contém ano. Esperado formato "MM MES DE AAAA.xlsx".`,
      'NOME_INVALIDO',
    );
  }
  const ano = Number.parseInt(matchAno[1]!, 10);

  for (const [token, mes] of Object.entries(MES_PT_TO_NUM)) {
    const re = new RegExp(`\\b${token}\\b`);
    if (re.test(norm)) {
      return { mes, ano };
    }
  }
  throw new EscalaXlsxParseError(
    `Nome do arquivo "${filename}" não contém nome de mês reconhecível.`,
    'NOME_INVALIDO',
  );
}

/**
 * Identifica as duas abas mensais relevantes (1ª quinzena e 2ª quinzena).
 * Aceita variações: "01 A 14 MAI", "01 A 13 JUN", "15 A 29 MAI", "15 A 31 JUL", etc.
 */
function findAbasMensais(wb: ExcelJS.Workbook): {
  aba1: ExcelJS.Worksheet;
  aba2: ExcelJS.Worksheet;
} {
  const norm = (s: string) =>
    s.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  let aba1: ExcelJS.Worksheet | null = null;
  let aba2: ExcelJS.Worksheet | null = null;

  for (const ws of wb.worksheets) {
    const n = norm(ws.name);
    // Primeira quinzena: "01 A 13/14 MES"
    if (/^0?1\s*A\s*1[34]\b/.test(n)) {
      aba1 = aba1 ?? ws;
      continue;
    }
    // Segunda quinzena: "15/14 A 29/30/31 MES"
    if (/^1[45]\s*A\s*(?:29|30|31)\b/.test(n)) {
      aba2 = aba2 ?? ws;
    }
  }

  if (!aba1 || !aba2) {
    const found = wb.worksheets.map((w) => `"${w.name}"`).join(', ');
    throw new EscalaXlsxParseError(
      `Abas mensais não encontradas. Esperado uma aba "01 A 14 [MES]" e outra "15 A 29/30/31 [MES]". Encontradas: ${found}.`,
      'ABAS_AUSENTES',
    );
  }
  return { aba1, aba2 };
}

/** Extrai texto plano de uma célula ExcelJS (suporta richText, hyperlink, fórmulas com result). */
function cellText(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v instanceof Date) {
    // YYYY-MM-DD em UTC-0 (que é como exceljs decodifica datas do XLSX).
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === 'object') {
    // ExcelJS rich text
    if ('richText' in v && Array.isArray((v as { richText: { text: string }[] }).richText)) {
      return (v as { richText: { text: string }[] }).richText
        .map((r) => r.text)
        .join('')
        .trim();
    }
    // formula com resultado
    if (
      'result' in v &&
      (v as { result: unknown }).result !== null &&
      (v as { result: unknown }).result !== undefined
    ) {
      const r = (v as { result: unknown }).result;
      if (typeof r === 'string') return r.trim();
      if (typeof r === 'number') return String(r);
      if (r instanceof Date) return r.toISOString().slice(0, 10);
    }
    if ('text' in v && typeof (v as { text: unknown }).text === 'string') {
      return (v as { text: string }).text.trim();
    }
    if ('hyperlink' in v && 'text' in v) {
      return String((v as { text: unknown }).text ?? '').trim();
    }
  }
  return String(v).trim();
}

/** Extrai dia (1-31) de uma célula que pode ser Date, número ou string. */
function cellAsDayOfMonth(cell: ExcelJS.Cell): number | null {
  const v = cell.value;
  if (v === null || v === undefined) return null;
  if (v instanceof Date) {
    // ExcelJS retorna em UTC; getUTCDate evita off-by-one.
    return v.getUTCDate();
  }
  if (typeof v === 'object' && 'result' in v) {
    const r = (v as { result: unknown }).result;
    if (r instanceof Date) return r.getUTCDate();
    if (typeof r === 'number' && Number.isFinite(r) && r >= 1 && r <= 31) return Math.floor(r);
    if (typeof r === 'string') {
      const n = Number.parseInt(r, 10);
      if (Number.isFinite(n) && n >= 1 && n <= 31) return n;
    }
  }
  if (typeof v === 'number' && Number.isFinite(v) && v >= 1 && v <= 31) return Math.floor(v);
  if (typeof v === 'string') {
    const m = v.match(/(\d{1,2})/);
    if (m) {
      const n = Number.parseInt(m[1]!, 10);
      if (n >= 1 && n <= 31) return n;
    }
  }
  return null;
}

/**
 * Localiza a linha com header de equipes ("EQUIPE A"/"EQUIPE B"/"EQUIPE C"/"EQUIPE D")
 * e devolve o mapa equipe→colunaInicial. Cada equipe ocupa 4 colunas redundantes a partir
 * dessa coluna.
 */
function findEquipeColumns(ws: ExcelJS.Worksheet, rowIdx: number): Map<LetraEquipe, number> {
  const result = new Map<LetraEquipe, number>();
  const row = ws.getRow(rowIdx);
  const last = Math.min(ws.columnCount, 30);
  for (let c = 1; c <= last; c++) {
    const txt = cellText(row.getCell(c)).toUpperCase();
    const m = txt.match(/EQUIPE\s+([ABCD])\b/);
    if (m && !result.has(m[1] as LetraEquipe)) {
      result.set(m[1] as LetraEquipe, c);
    }
  }
  return result;
}

/**
 * Extrai mapa "diaDoMes → letraEquipe" de uma aba.
 * Estrutura observada: linhas 9 ou 10 contêm as datas (dia do mês ou Date completo);
 * linhas 12 ou 13 contêm a letra da equipe escalada.
 */
function extractDiaEquipe(
  ws: ExcelJS.Worksheet,
  startCol: number,
  endCol: number,
  ano: number,
  mes: number,
): { diaEquipe: Record<string, LetraEquipe>; avisos: string[] } {
  const avisos: string[] = [];
  const diaEquipe: Record<string, LetraEquipe> = {};

  // Tenta extrair dias das linhas 9 ou 10 (fallback).
  const dias: (number | null)[] = [];
  const rowDias = [9, 10];
  for (let c = startCol; c <= endCol; c++) {
    let dia: number | null = null;
    for (const r of rowDias) {
      dia = cellAsDayOfMonth(ws.getRow(r).getCell(c));
      if (dia !== null) break;
    }
    dias.push(dia);
  }

  // Equipes nas linhas 12 ou 13.
  const equipes: (LetraEquipe | null)[] = [];
  const rowEquipes = [12, 13];
  for (let c = startCol; c <= endCol; c++) {
    let eq: LetraEquipe | null = null;
    for (const r of rowEquipes) {
      const txt = cellText(ws.getRow(r).getCell(c)).toUpperCase().trim();
      if (LETRA_EQUIPE.includes(txt as LetraEquipe)) {
        eq = txt as LetraEquipe;
        break;
      }
    }
    equipes.push(eq);
  }

  for (let i = 0; i < dias.length; i++) {
    const dia = dias[i];
    const eq = equipes[i];
    if (dia === null || eq === null) continue;
    const data = `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
    if (diaEquipe[data] && diaEquipe[data] !== eq) {
      avisos.push(
        `Conflito de equipe para ${data}: já mapeada como ${diaEquipe[data]}, encontrada também como ${eq}.`,
      );
      continue;
    }
    diaEquipe[data] = eq;
  }

  return { diaEquipe, avisos };
}

/** Normaliza posto+nome em uma célula do tipo "2º SGT JULIO" → { posto: "2ºSGT", nome: "JULIO" }. */
export function parseMilitarCell(raw: string): MilitarRef | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '--' || trimmed === '-') return null;

  const cleaned = trimmed
    .replace(/\s+/g, ' ')
    .replace(/\bDE\b/, 'DE')
    .trim();

  // Padrões: "2º SGT JULIO", "1º SGT HEVERTON", "CB FABRE", "SD MARTINELLI", "TEN QOC VASSEM".
  const re =
    /^(?<posto>(?:[1-3]º\s*)?(?:CEL|TEN\s*CEL|MAJ|CAP|TEN(?:\s+QOC)?|SUB\s*TEN|SGT|CB|SD|AL))\s+(?<nome>.+)$/i;
  const m = cleaned.match(re);
  if (!m || !m.groups) {
    // Fallback: assume tudo nome
    return { raw: trimmed, postoAbreviado: '', nomeGuerra: trimmed };
  }
  const posto = m.groups.posto.replace(/\s+/g, '').replace(/º/g, 'º').toUpperCase();
  const nome = m.groups.nome.trim().toUpperCase();
  return { raw: trimmed, postoAbreviado: posto, nomeGuerra: nome };
}

/**
 * Extrai entradas de composição de uma aba dada o mapa de equipes.
 * Linhas 16-31 normalmente — varremos até a linha onde col1 fica vazia E col2 fica vazia.
 */
function extractComposicao(
  ws: ExcelJS.Worksheet,
  equipeCols: Map<LetraEquipe, number>,
  rowStart: number,
  rowEnd: number,
): { entries: ComposicaoEntry[]; avisos: string[] } {
  const avisos: string[] = [];
  const entries: ComposicaoEntry[] = [];

  let viaturaCorrente = '';
  for (let r = rowStart; r <= rowEnd; r++) {
    const row = ws.getRow(r);
    const col1 = cellText(row.getCell(1));
    const col2 = cellText(row.getCell(2));

    if (col1) viaturaCorrente = col1;
    const viatura = viaturaCorrente;
    const funcao = col2;

    if (!viatura && !funcao) continue;
    if (!funcao) continue; // sem função, não é linha de composição

    for (const [equipe, startCol] of equipeCols.entries()) {
      // Cada equipe tem 4 cols redundantes; pega a primeira não-vazia.
      let raw = '';
      for (let off = 0; off < 4; off++) {
        const v = cellText(row.getCell(startCol + off));
        if (v) {
          raw = v;
          break;
        }
      }
      if (!raw) continue;
      const militar = parseMilitarCell(raw);
      if (!militar) {
        avisos.push(
          `Linha ${r}, equipe ${equipe}, ${viatura}/${funcao}: célula "${raw}" não reconhecida como militar.`,
        );
        continue;
      }
      entries.push({ equipe, viatura, funcao, militar });
    }
  }

  return { entries, avisos };
}

/**
 * Heurística para extrair a aba inteira: identifica linhas das equipes (header EQUIPE X),
 * extrai o range de dias no header, identifica colunas de cada equipe e itera linhas 16-31.
 */
function parseAba(
  ws: ExcelJS.Worksheet,
  ano: number,
  mes: number,
): {
  diaEquipe: Record<string, LetraEquipe>;
  composicao: ComposicaoEntry[];
  avisos: string[];
} {
  const avisos: string[] = [];

  // Encontrar linha do header EQUIPE A/B/C/D (esperado linha 15).
  let headerRow = 15;
  let equipeCols = findEquipeColumns(ws, headerRow);
  if (equipeCols.size < 4) {
    for (let r = 13; r <= 18; r++) {
      const cols = findEquipeColumns(ws, r);
      if (cols.size > equipeCols.size) {
        equipeCols = cols;
        headerRow = r;
      }
    }
  }
  if (equipeCols.size < 4) {
    throw new EscalaXlsxParseError(
      `Aba "${ws.name}": header de equipes (EQUIPE A/B/C/D) não encontrado nas linhas 13-18.`,
      'LAYOUT_INVALIDO',
    );
  }

  // Detectar range de colunas de equipes.
  const colsList = [...equipeCols.values()].sort((a, b) => a - b);
  const startCol = colsList[0]!;
  const endCol = colsList[colsList.length - 1]! + 3; // última equipe ocupa +3

  const { diaEquipe, avisos: avisosDia } = extractDiaEquipe(ws, startCol, endCol, ano, mes);
  avisos.push(...avisosDia);

  const { entries, avisos: avisosComp } = extractComposicao(
    ws,
    equipeCols,
    headerRow + 1,
    headerRow + 17, // até ~linha 32; abaixo é seção de férias
  );
  avisos.push(...avisosComp);

  return { diaEquipe, composicao: entries, avisos };
}

/**
 * Mescla composições das duas abas. Composição é constante por equipe×viatura×função
 * dentro do mesmo mês — se as duas abas divergirem, mantém a primeira e registra aviso.
 */
function mergeComposicao(
  a: ComposicaoEntry[],
  b: ComposicaoEntry[],
  avisos: string[],
): ComposicaoEntry[] {
  const map = new Map<string, ComposicaoEntry>();
  const key = (e: ComposicaoEntry) => `${e.equipe}|${e.viatura}|${e.funcao}`;
  for (const entry of a) map.set(key(entry), entry);
  for (const entry of b) {
    const k = key(entry);
    const existing = map.get(k);
    if (!existing) {
      map.set(k, entry);
    } else if (existing.militar.raw !== entry.militar.raw) {
      avisos.push(
        `Composição diverge entre quinzenas para ${entry.equipe}/${entry.viatura}/${entry.funcao}: 1ª quinzena "${existing.militar.raw}", 2ª quinzena "${entry.militar.raw}". Mantendo 1ª quinzena.`,
      );
    }
  }
  return [...map.values()].sort(
    (x, y) =>
      x.equipe.localeCompare(y.equipe) ||
      x.viatura.localeCompare(y.viatura) ||
      x.funcao.localeCompare(y.funcao),
  );
}

export interface ParseEscalaInput {
  /** Buffer do arquivo XLSX (do upload multipart). */
  buffer: Buffer;
  /** Nome original do arquivo, para validação e auditoria. */
  filename: string;
  /** NF de quem está importando. Opcional. */
  importadoPorNf?: string;
}

/**
 * Parser principal: recebe Buffer + filename e retorna a EscalaMensal estruturada.
 * Lança EscalaXlsxParseError em caso de rejeição.
 */
export async function parseEscalaXlsx(input: ParseEscalaInput): Promise<EscalaMensal> {
  const { mes, ano } = parseFilename(input.filename);

  const wb = new ExcelJS.Workbook();
  try {
    // ExcelJS aceita Buffer; cast contorna tipagem antiga (`Buffer<ArrayBuffer>` vs `Buffer<ArrayBufferLike>` no Node 20+).
    await wb.xlsx.load(input.buffer as unknown as ArrayBuffer);
  } catch (err) {
    throw new EscalaXlsxParseError(
      `Não foi possível ler o XLSX (${err instanceof Error ? err.message : 'erro desconhecido'}).`,
      'ARQUIVO_CORROMPIDO',
    );
  }

  const { aba1, aba2 } = findAbasMensais(wb);
  const avisos: string[] = [];

  const r1 = parseAba(aba1, ano, mes);
  avisos.push(...r1.avisos.map((m) => `[${aba1.name}] ${m}`));
  const r2 = parseAba(aba2, ano, mes);
  avisos.push(...r2.avisos.map((m) => `[${aba2.name}] ${m}`));

  const diaEquipe = { ...r1.diaEquipe, ...r2.diaEquipe };
  const composicao = mergeComposicao(r1.composicao, r2.composicao, avisos);

  if (Object.keys(diaEquipe).length === 0) {
    throw new EscalaXlsxParseError(
      'Nenhum mapeamento dia→equipe foi encontrado. Layout do XLSX provavelmente mudou.',
      'LAYOUT_INVALIDO',
    );
  }
  if (composicao.length === 0) {
    throw new EscalaXlsxParseError(
      'Nenhuma composição de equipe foi encontrada.',
      'LAYOUT_INVALIDO',
    );
  }

  return {
    mes,
    ano,
    origemArquivo: input.filename,
    importadoEm: new Date().toISOString(),
    importadoPorNf: input.importadoPorNf,
    diaEquipe,
    composicao,
    avisos,
  };
}

/** Helper para tests: nome canônico de arquivo a partir de mês/ano. */
export function canonicalFilename(mes: number, ano: number): string {
  return `${String(mes).padStart(2, '0')} ${MES_NUM_TO_FULL[mes]} DE ${ano}.xlsx`;
}

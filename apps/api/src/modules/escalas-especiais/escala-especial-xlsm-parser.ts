import ExcelJS from 'exceljs';
import type { EscalaEspecialAto, EscalaEspecialMensal } from '@argus/shared-types';

/**
 * Parser do XLSM `MM - ESCALA ESPECIAL 1ª CIA - MES.xlsm`.
 *
 * Aba relevante: `Modelo Aviso - Especial` — tabela de 4 colunas a partir da linha 5:
 * | Col | Conteúdo |
 * | --- | -------- |
 * | 14 (N) | MILITAR (texto cru, ex.: "SGT MARIANE") |
 * | 15 (O) | HORÁRIO (ex.: "07:10 ÀS 13:10") |
 * | 16 (P) | DATA (Date / ISO YYYY-MM-DD) |
 * | 17 (Q) | FUNÇÃO (ex.: "APOIO", "SENTINELA") |
 *
 * Linhas com militar = "XXX" são descartadas (placeholder de turno vago).
 *
 * Reusa: cellText / cellAsDayOfMonth do escala-xlsx-parser? — Não; o formato é diferente
 * o suficiente para justificar implementação local (mais legível).
 */

export class EscalaEspecialParseError extends Error {
  constructor(
    message: string,
    readonly code: 'NOME_INVALIDO' | 'ABA_AUSENTE' | 'ARQUIVO_CORROMPIDO' | 'LAYOUT_INVALIDO',
  ) {
    super(message);
    this.name = 'EscalaEspecialParseError';
  }
}

const MES_TO_NUM: Record<string, number> = {
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

/**
 * Identifica mês/ano do nome do arquivo. Aceita padrão `MM - ESCALA ESPECIAL ... - MES.xlsm`.
 */
export function parseFilenameEspecial(filename: string): { mes: number; ano: number } {
  const norm = filename.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (!norm.includes('ESCALA ESPECIAL')) {
    throw new EscalaEspecialParseError(
      `Nome do arquivo "${filename}" não contém "ESCALA ESPECIAL". Esperado "MM - ESCALA ESPECIAL 1ª CIA - MES.xlsm".`,
      'NOME_INVALIDO',
    );
  }

  // Tenta achar "MM" no início
  const mmMatch = norm.match(/^(0?[1-9]|1[0-2])\s*-/);
  let mes: number | null = null;
  if (mmMatch) mes = Number.parseInt(mmMatch[1]!, 10);

  // Se não achou, tenta pelo nome do mês no final
  if (mes === null) {
    for (const [token, m] of Object.entries(MES_TO_NUM)) {
      if (new RegExp(`\\b${token}\\b`).test(norm)) {
        mes = m;
        break;
      }
    }
  }
  if (mes === null) {
    throw new EscalaEspecialParseError(
      `Nome "${filename}" não contém número/nome de mês reconhecível.`,
      'NOME_INVALIDO',
    );
  }

  // Ano: pega 20XX no nome, ou usa ano atual se ausente
  const anoMatch = norm.match(/(20\d{2})/);
  const ano = anoMatch ? Number.parseInt(anoMatch[1]!, 10) : new Date().getFullYear();

  return { mes, ano };
}

function cellText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if ('text' in v && typeof (v as { text: unknown }).text === 'string') {
      return (v as { text: string }).text.trim();
    }
    if ('result' in v) {
      const r = (v as { result: unknown }).result;
      if (typeof r === 'string') return r.trim();
      if (typeof r === 'number') return String(r);
      if (r instanceof Date) return r.toISOString().slice(0, 10);
    }
    if ('richText' in v && Array.isArray((v as { richText: { text: string }[] }).richText)) {
      return (v as { richText: { text: string }[] }).richText
        .map((r) => r.text)
        .join('')
        .trim();
    }
  }
  return String(v).trim();
}

/** Converte célula que pode ser Date / string ISO / formato BR para "YYYY-MM-DD". */
function cellToIsoDate(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) {
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === 'object') {
    if ('result' in v) {
      const r = (v as { result: unknown }).result;
      if (r instanceof Date) return r.toISOString().slice(0, 10);
      if (typeof r === 'string') return cellToIsoDate(r);
    }
    if ('text' in v && typeof (v as { text: unknown }).text === 'string') {
      return cellToIsoDate((v as { text: string }).text);
    }
  }
  if (typeof v === 'string') {
    const s = v.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.slice(0, 10);
    // dd/mm/yyyy
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) {
      const [, d, mm, y] = m;
      return `${y}-${mm!.padStart(2, '0')}-${d!.padStart(2, '0')}`;
    }
  }
  return null;
}

export interface ParseEscalaEspecialInput {
  buffer: Buffer;
  filename: string;
  importadoPorNf?: string;
}

export async function parseEscalaEspecialXlsm(
  input: ParseEscalaEspecialInput,
): Promise<{ escala: EscalaEspecialMensal; descartados: number }> {
  const { mes, ano } = parseFilenameEspecial(input.filename);

  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(input.buffer as unknown as ArrayBuffer);
  } catch (err) {
    throw new EscalaEspecialParseError(
      `Não foi possível ler o XLSM (${err instanceof Error ? err.message : 'erro'}).`,
      'ARQUIVO_CORROMPIDO',
    );
  }

  const ws = wb.getWorksheet('Modelo Aviso - Especial');
  if (!ws) {
    const found = wb.worksheets.map((w) => `"${w.name}"`).join(', ');
    throw new EscalaEspecialParseError(
      `Aba "Modelo Aviso - Especial" não encontrada. Abas presentes: ${found}.`,
      'ABA_AUSENTE',
    );
  }

  const atos: EscalaEspecialAto[] = [];
  const avisos: string[] = [];
  let descartados = 0;

  // Procura header MILITAR/HORÁRIO/DATA/FUNÇÃO em alguma linha 1-10
  let headerRow = -1;
  let colMilitar = -1;
  let colHorario = -1;
  let colData = -1;
  let colFuncao = -1;
  // Há 2 tabelas paralelas na aba (mês corrente + período anterior).
  // Pegamos APENAS a primeira ocorrência de cada cabeçalho (cols mais à esquerda).
  for (let r = 1; r <= 10; r++) {
    let m = -1;
    let h = -1;
    let d = -1;
    let f = -1;
    const row = ws.getRow(r);
    for (let c = 1; c <= Math.min(35, ws.actualColumnCount); c++) {
      const t = cellText(row.getCell(c).value).toUpperCase();
      if (t === 'MILITAR' && m < 0) m = c;
      else if ((t === 'HORÁRIO' || t === 'HORARIO') && h < 0) h = c;
      else if (t === 'DATA' && d < 0) d = c;
      else if ((t === 'FUNÇÃO' || t === 'FUNCAO') && f < 0) f = c;
    }
    if (m > 0 && h > 0 && d > 0 && f > 0) {
      colMilitar = m;
      colHorario = h;
      colData = d;
      colFuncao = f;
      headerRow = r;
      break;
    }
  }

  if (headerRow < 0) {
    throw new EscalaEspecialParseError(
      'Cabeçalho MILITAR/HORÁRIO/DATA/FUNÇÃO não encontrado na aba Modelo Aviso - Especial.',
      'LAYOUT_INVALIDO',
    );
  }

  for (let r = headerRow + 1; r <= ws.actualRowCount; r++) {
    const row = ws.getRow(r);
    const militarRaw = cellText(row.getCell(colMilitar).value);
    const horario = cellText(row.getCell(colHorario).value);
    const dataIso = cellToIsoDate(row.getCell(colData).value);
    const funcao = cellText(row.getCell(colFuncao).value);

    // XXX = turno vago, descartar
    if (militarRaw === 'XXX' || militarRaw === '') {
      if (militarRaw === 'XXX') descartados++;
      continue;
    }
    if (!horario || !dataIso || !funcao) {
      avisos.push(`Linha ${r}: militar="${militarRaw}" mas falta horário/data/função — pulado.`);
      continue;
    }

    atos.push({
      data: dataIso,
      militarRaw,
      horario,
      funcao,
    });
  }

  return {
    escala: {
      mes,
      ano,
      origemArquivo: input.filename,
      importadoEm: new Date().toISOString(),
      importadoPorNf: input.importadoPorNf,
      atos,
      avisos,
    },
    descartados,
  };
}

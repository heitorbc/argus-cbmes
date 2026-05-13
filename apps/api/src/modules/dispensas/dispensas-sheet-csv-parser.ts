import type { DispensaSheet } from '@argus/shared-types';

/**
 * Parser do CSV da aba "Dispensas 2026" (item 2).
 *
 * Layout 2D: 12 meses em grid horizontal de 6 colunas/mês (5 dados +
 * 1 separador), repetido em 2-3 blocos verticais. Headers de mês ficam
 * em linhas dedicadas (cada bloco abre com "JANEIRO"/"FEVEREIRO"/...).
 *
 * Cabeçalho típico do bloco 1, linha 0:
 *   "DISPENSAS CONCEDIDAS EM 2026 JANEIRO NOME","DATA","EDOCS","EQUIPE","MINUTA",""
 *   "MARÇO NOME","DATA","EDOCS","EQUIPE","MINUTA",""
 *   "MAIO NOME","DATA","EDOCS","EQUIPE","MINUTA"
 *
 * Variações conhecidas:
 *   - Algumas linhas-header usam só "NOME" (sem o nome do mês — herda do bloco anterior).
 *   - DATA pode aparecer "DD/MM" (ano implícito) ou "DD/MM/AAAA".
 */

const MESES_PT_TO_NUM: Record<string, number> = {
  JANEIRO: 1,
  FEVEREIRO: 2,
  MARCO: 3,
  MARÇO: 3,
  ABRIL: 4,
  MAIO: 5,
  JUNHO: 6,
  JULHO: 7,
  AGOSTO: 8,
  SETEMBRO: 9,
  OUTUBRO: 10,
  NOVEMBRO: 11,
  DEZEMBRO: 12,
};

interface BlocoMes {
  mes: number;
  colInicio: number;
}

export function parseDispensasSheetCsv(
  csv: string,
  anoDefault = new Date().getFullYear(),
): DispensaSheet[] {
  const linhas = parseCsvRobust(csv);
  if (linhas.length === 0) return [];

  const out: DispensaSheet[] = [];

  // Detecta o ano explícito no header da planilha (ex.: "DISPENSAS CONCEDIDAS EM 2026 ...").
  const anoHeader = extrairAnoHeader(linhas[0]?.[0] ?? '');
  const ano = anoHeader ?? anoDefault;

  // Varre linhas; mantém estado dos "blocos de mês" ativos (qual mês começa em qual coluna).
  let blocos: BlocoMes[] = [];

  for (let r = 0; r < linhas.length; r += 1) {
    const cols = linhas[r]!;

    // Atualiza blocos quando encontra header com nomes de meses
    const novosBlocos = detectarBlocosNaLinha(cols);
    if (novosBlocos.length > 0) {
      blocos = novosBlocos;
      continue;
    }

    // Linhas como "NOME","DATA","EDOCS","EQUIPE","MINUTA" são headers de coluna; ignora.
    if (isLinhaHeaderColunas(cols)) continue;

    // Para cada bloco ativo, extrair dados desta linha.
    for (const b of blocos) {
      const nome = (cols[b.colInicio] ?? '').trim();
      if (!nome) continue;
      // Data fica na col +1 (geralmente). Pode estar DD/MM ou DD/MM/AAAA.
      const dataRaw = (cols[b.colInicio + 1] ?? '').trim();
      const dataIso = parseDataDDMMOuISO(dataRaw, b.mes, ano);
      if (!dataIso) continue;
      const edocs = (cols[b.colInicio + 2] ?? '').trim();
      const equipe = (cols[b.colInicio + 3] ?? '').trim();
      const minuta = (cols[b.colInicio + 4] ?? '').trim();
      out.push({
        data: dataIso,
        militarRaw: nome,
        equipe: equipe || undefined,
        edocs: edocs || undefined,
        minuta: minuta || undefined,
      });
    }
  }

  return out;
}

function extrairAnoHeader(headerCell: string): number | null {
  const m = /(\b20\d{2})/.exec(headerCell);
  return m ? Number(m[1]) : null;
}

/**
 * Detecta blocos de mês numa linha. Cada célula que mencione um mês
 * (sozinho ou prefixado a "NOME") inicia um bloco. Retorna array com
 * o mês e a coluna onde começa.
 */
function detectarBlocosNaLinha(cols: readonly string[]): BlocoMes[] {
  const out: BlocoMes[] = [];
  for (let c = 0; c < cols.length; c += 1) {
    const cell = (cols[c] ?? '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const m = cell.match(
      /(JANEIRO|FEVEREIRO|MARCO|MARÇO|ABRIL|MAIO|JUNHO|JULHO|AGOSTO|SETEMBRO|OUTUBRO|NOVEMBRO|DEZEMBRO)/,
    );
    if (m) {
      const mes = MESES_PT_TO_NUM[m[1]!];
      if (mes && !out.some((b) => b.colInicio === c)) {
        out.push({ mes, colInicio: c });
      }
    }
  }
  return out;
}

function isLinhaHeaderColunas(cols: readonly string[]): boolean {
  // Considera header se a maioria das células não vazias é {NOME, DATA, EDOCS, EQUIPE, MINUTA}.
  const palavrasHeader = new Set(['NOME', 'DATA', 'EDOCS', 'EQUIPE', 'MINUTA', 'BCG']);
  let hits = 0;
  let total = 0;
  for (const c of cols) {
    const t = c.trim().toUpperCase();
    if (!t) continue;
    total += 1;
    if (palavrasHeader.has(t)) hits += 1;
  }
  return total >= 2 && hits / total >= 0.5;
}

function parseDataDDMMOuISO(input: string, mesEsperado: number, anoDefault: number): string | null {
  const t = input.trim();
  if (!t) return null;
  // DD/MM/AAAA
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo!.padStart(2, '0')}-${d!.padStart(2, '0')}`;
  }
  // DD/MM (assume ano padrão)
  m = /^(\d{1,2})\/(\d{1,2})$/.exec(t);
  if (m) {
    const [, d, mo] = m;
    const moNum = Number(mo);
    if (moNum !== mesEsperado) {
      // Mês diferente do esperado pelo bloco — provavelmente erro de digitação na planilha.
      // Aceitamos mas usa o valor do mês conforme a célula.
    }
    return `${anoDefault}-${mo!.padStart(2, '0')}-${d!.padStart(2, '0')}`;
  }
  return null;
}

/** CSV parser tolerante a aspas — mesmo helper usado em trocas-autorizadas. */
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

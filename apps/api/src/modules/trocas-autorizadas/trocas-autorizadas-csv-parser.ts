import type { TrocaAutorizada } from '@argus/shared-types';

/**
 * Parser do CSV da planilha "Trocas Autorizadas" (Google Sheets, item 1).
 *
 * Estrutura esperada (16 colunas):
 *  A  STATUS                          (ignorada — só importamos linhas AUTORIZADA)
 *  B  Carimbo de data/hora
 *  C  Endereço de e-mail
 *  D  DATA DA ESCALA
 *  E  ESCALADO
 *  F  SUBSTITUTO
 *  G  FUNÇÃO
 *  H  HORÁRIO
 *  I  DATA DO PAGAMENTO
 *  J  ESCALADO (pagamento)
 *  K  SUBSTITUTO (pagamento)
 *  L  FUNÇÃO (pagamento)
 *  M  HORÁRIO (pagamento)
 *  N  É dobra 48h?
 *  O  Nº E-Docs
 *  P  Nº registro
 */
export function parseTrocasAutorizadasCsv(csv: string): TrocaAutorizada[] {
  const linhas = parseCsvRobust(csv);
  if (linhas.length < 2) return [];

  // Skip header (linha 0). Aceita variações de capitalização.
  const out: TrocaAutorizada[] = [];
  for (let i = 1; i < linhas.length; i += 1) {
    const cols = linhas[i]!;
    if (cols.length < 13) continue; // linha incompleta
    const status = (cols[0] ?? '').trim().toUpperCase();
    if (status && status !== 'AUTORIZADA') continue; // só importa AUTORIZADA

    const registradoEm = (cols[1] ?? '').trim();
    const emailRegistrante = (cols[2] ?? '').trim() || undefined;

    const dataEscala = brDateToIso(cols[3] ?? '');
    const dataPagamento = brDateToIso(cols[8] ?? '');
    if (!dataEscala || !dataPagamento) continue; // datas inválidas

    const isDobraText = (cols[13] ?? '').trim().toUpperCase();
    const isDobra48h = isDobraText.startsWith('SIM');

    out.push({
      id: `troca:${i}-${dataEscala}`,
      registradoEm,
      emailRegistrante,
      dataEscala,
      escaladoOriginal: (cols[4] ?? '').trim(),
      substituto: (cols[5] ?? '').trim(),
      funcao: (cols[6] ?? '').trim(),
      horario: (cols[7] ?? '').trim(),
      dataPagamento,
      escaladoPagamento: (cols[9] ?? '').trim(),
      substitutoPagamento: (cols[10] ?? '').trim(),
      funcaoPagamento: (cols[11] ?? '').trim(),
      horarioPagamento: (cols[12] ?? '').trim(),
      isDobra48h,
      numeroEdocs: (cols[14] ?? '').trim() || undefined,
      numeroRegistro: (cols[15] ?? '').trim() || undefined,
    });
  }
  return out;
}

/** Devolve trocas autorizadas que afetam uma data ISO específica (lado escala OU pagamento). */
export function trocasNoData(
  trocas: readonly TrocaAutorizada[],
  dataIso: string,
): TrocaAutorizada[] {
  return trocas.filter((t) => t.dataEscala === dataIso || t.dataPagamento === dataIso);
}

/** Converte "DD/MM/AAAA" → "AAAA-MM-DD"; retorna null em formato inválido. */
function brDateToIso(input: string): string | null {
  const m = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/.exec(input);
  if (!m) return null;
  const [, d, mo, y] = m;
  return `${y}-${mo!.padStart(2, '0')}-${d!.padStart(2, '0')}`;
}

/**
 * CSV parser tolerante a aspas e vírgulas dentro de campos. Necessário pois
 * a planilha tem campos longos (texto livre) com vírgulas e quebras de linha.
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
      // skip \r\n pair
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
  return out.filter((r) => r.some((c) => c.trim() !== ''));
}

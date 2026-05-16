import type { TrocaAutorizada, TrocaStatus } from '@argus/shared-types';

/**
 * Parser do CSV da planilha "Trocas Autorizadas" (Google Sheets, item 1).
 *
 * Estrutura atualizada em S2.8.3 — 25 colunas (verificado via CSV cru):
 *  A  (0)  STATUS TROCA              VERIFICADO/PENDENTE (badge para Fiscal)
 *  B  (1)  STATUS NOME               NOME OK (informativo, só no detalhe)
 *  C  (2)  Carimbo de data/hora
 *  D  (3)  Endereço de e-mail
 *  E  (4)  DATA DA ESCALA
 *  F  (5)  NÚMERO FUNCIONAL DO ESCALADO   (usualmente vazio; preencher form)
 *  G  (6)  NF DO MILITAR ESCALADO         (NF resolvida; usar como chave!)
 *  H  (7)  AUTO Nome Militar Escalado     (auto-preenchido via QDI)
 *  I  (8)  ESCALADO                       (nome manual, fallback)
 *  J  (9)  NÚMERO FUNCIONAL DO SUBSTITUTO (vazio)
 *  K  (10) NF DO MILITAR SUBSTITUTO       (NF resolvida; usar como chave!)
 *  L  (11) AUTO Nome Militar Subistituto  (auto-preenchido via QDI)
 *  M  (12) SUBSTITUTO                     (nome manual, fallback)
 *  N  (13) FUNÇÃO
 *  O  (14) HORÁRIO
 *  P  (15) DATA DO PAGAMENTO
 *  Q  (16) ESCALADO (pagamento — nome manual)
 *  R  (17) SUBSTITUTO (pagamento — nome manual)
 *  S  (18) FUNÇÃO (pagamento)
 *  T  (19) HORÁRIO (pagamento)
 *  U  (20) A troca de serviço trata-se de uma dobra de serviço (48h)?
 *  V  (21) Informe o Nº do E-Docs
 *  W  (22) NÚMERO FUNCIONAL DO MILITAR ESCALADO (vazio)
 *  X  (23) NÚMERO FUNCIONAL DO MILITAR SUBSTITUTO (vazio)
 *  Y  (24) nº registro da troca
 *
 * Diferenças vs. versão antiga:
 *  - Coluna A não filtra mais por "AUTORIZADA" (todas as linhas entram;
 *    PENDENTE vs VERIFICADO é apenas badge informativo).
 *  - Identificação dos militares passa a usar NF (col G e K), com
 *    fallback para o nome auto (H/L) ou manual (I/M) em compat.
 */
export function parseTrocasAutorizadasCsv(csv: string): TrocaAutorizada[] {
  const linhas = parseCsvRobust(csv);
  if (linhas.length < 2) return [];

  const out: TrocaAutorizada[] = [];
  for (let i = 1; i < linhas.length; i += 1) {
    const cols = linhas[i]!;
    if (cols.length < 13) continue; // linha incompleta

    const statusTroca = parseStatus((cols[0] ?? '').trim());
    const statusNome = (cols[1] ?? '').trim() || undefined;
    const registradoEm = (cols[2] ?? '').trim();
    const emailRegistrante = (cols[3] ?? '').trim() || undefined;

    const dataEscala = brDateToIso(cols[4] ?? '');
    const dataPagamento = brDateToIso(cols[15] ?? '');
    if (!dataEscala || !dataPagamento) continue; // datas inválidas

    // Identificação dos militares: prioriza colunas G (NF) e H (auto nome).
    // Fallback para I (nome manual) quando o auto não foi preenchido.
    const escaladoOriginalNf = onlyDigits(cols[6] ?? '') || undefined;
    const escaladoOriginal = (cols[7] ?? '').trim() || (cols[8] ?? '').trim();
    const substitutoNf = onlyDigits(cols[10] ?? '') || undefined;
    const substituto = (cols[11] ?? '').trim() || (cols[12] ?? '').trim();

    const isDobraText = (cols[20] ?? '').trim().toUpperCase();
    const isDobra48h = isDobraText.startsWith('SIM');

    out.push({
      id: `troca:${i}-${dataEscala}`,
      registradoEm,
      emailRegistrante,
      statusTroca,
      statusNome,
      dataEscala,
      escaladoOriginal,
      escaladoOriginalNf,
      substituto,
      substitutoNf,
      funcao: (cols[13] ?? '').trim(),
      horario: (cols[14] ?? '').trim(),
      dataPagamento,
      escaladoPagamento: (cols[16] ?? '').trim(),
      substitutoPagamento: (cols[17] ?? '').trim(),
      funcaoPagamento: (cols[18] ?? '').trim(),
      horarioPagamento: (cols[19] ?? '').trim(),
      isDobra48h,
      numeroEdocs: (cols[21] ?? '').trim() || undefined,
      numeroRegistro: (cols[24] ?? '').trim() || undefined,
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

function parseStatus(raw: string): TrocaStatus | undefined {
  const up = raw.toUpperCase();
  if (up === 'VERIFICADO') return 'VERIFICADO';
  if (up === 'PENDENTE') return 'PENDENTE';
  return undefined;
}

function onlyDigits(raw: string): string {
  return raw.trim().replace(/\D/g, '');
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

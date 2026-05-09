import { parse } from 'csv-parse/sync';
import type { Militar } from '@argus/shared-types';

/**
 * Parser da aba `DADOS` do QDI (gid `1395786516`).
 *
 * Layout posicional verificado em 2026-05-09 (snapshot em `__fixtures__/qdi-dados-2026-05-09.csv`):
 *
 * | Col | Conteúdo                       | Exemplo                         |
 * | --- | ------------------------------ | ------------------------------- |
 * | 0   | NF DUPLICADO (flag, ignorar)   | "1"                             |
 * | 1   | NF                             | "3037509"                       |
 * | 2   | ANT                            | "418"                           |
 * | 3   | POST/GRAD                      | "2ºSGT", "TC", "CB"             |
 * | 4   | NOME DE GUERRA                 | "BARCELLOS"                     |
 * | 5   | NOME (completo)                | "HEITOR BARCELLOS COELHO"       |
 * | 6   | RESIDENCIA (SIARHES)           | "VITORIA"                       |
 * | 7   | LOCAL (lotação) ← FILTRO       | "1ª1º"                          |
 * | 8   | CLASSE                         | "ADM 11", "PRONT 11"            |
 * | 9   | SUBST.                         | (vazio)                         |
 * | 10  | DESIG.                         | "SIM"                           |
 * | 11  | FG                             | "TC"                            |
 * | 12  | SITUAÇÃO                       | "APTO", "FÉRIAS"                |
 * | 13  | INÍCIO                         | (datas)                         |
 * | 14  | RETORNO                        |                                 |
 * | 15  | FÉRIAS (mês)                   | "DEZ", "MAR"                    |
 * | 16  | CONCEITO DISCIPLINAR           | "CD-A", "CD-B"                  |
 * | 17  | PONTOS                         | "100", "80"                     |
 * | 18  | CNH                            | "AB", "B"                       |
 * | 19  | VALIDADE CNH                   | "12/02/2024"                    |
 * | 20  | MERG (mergulhador)             | "SIM", "NÃO"                    |
 * | 21  | FTBA                           |                                 |
 * | 22  | CENSO                          | "10/2020"                       |
 * | 23  | CCVE                           | "SIM", "NÃO"                    |
 * | 24  | VALIDADE CCVE                  |                                 |
 * | 25  | ETSP                           |                                 |
 * | 26  | VALIDADE ETSP                  |                                 |
 * | 27  | INCORPORAÇÃO                   | "19/03/2001"                    |
 * | 28  | PLANO DE FÉRIAS                | "NOV"                           |
 *
 * Filtro padrão: `LOCAL == "1ª1º"` (apenas militares lotados na 1ª Cia/1º BBM).
 *
 * Diferenças vs `qdi-csv-parser.ts` (aba 1ª1º):
 * - Aba DADOS é **a tabela completa do CBMES**; precisa filtrar por LOCAL.
 * - Aba 1ª1º já está pré-filtrada e tem agrupamento por seção (staff/sos/guarda/aquaticas).
 * - Em S6a, DADOS vira primária; aba 1ª1º complementa (mais atualizada por DRH); EFETIVO fallback.
 */

export interface MilitarDados extends Omit<
  Militar,
  'nome' | 'posto' | 'ant' | 'nf' | 'origensFonte'
> {
  nf: string;
  ant: number;
  posto: string; // POST/GRAD da DADOS = atual
  nome: string; // NOME completo da DADOS
  nomeGuerra?: string;
  lotacao?: string;
}

const HEADER_HINTS = [
  'NF DUPLICADO',
  'NF',
  'ANT',
  'POST/GRAD',
  'NOME DE GUERRA',
  'NOME',
  'RESIDENCIA',
  'LOCAL',
];

/**
 * Faz o parse de um CSV inteiro da aba DADOS e retorna a lista de militares filtrada por LOCAL.
 *
 * @param csv Conteúdo do CSV.
 * @param locaisAceitos Filtro de lotação (ex.: ["1ª1º"]). Default: aceita 1ª1º + variações comuns.
 */
export function parseQdiDadosCsv(
  csv: string,
  locaisAceitos: string[] = ['1ª1º', '1ª/1º'],
): MilitarDados[] {
  const rows = parse(csv, {
    columns: false,
    skip_empty_lines: false,
    relax_column_count: true,
    relax_quotes: true,
  }) as string[][];

  const out: MilitarDados[] = [];
  let inDataSection = false;

  for (const row of rows) {
    if (row.length < 8) continue;

    // Detecta cabeçalho de coluna (linha que tem "NF DUPLICADO,NF,ANT,POST/GRAD,...")
    const cellsJoined = row.slice(0, 8).join(' ').toUpperCase();
    if (HEADER_HINTS.every((h) => cellsJoined.includes(h))) {
      inDataSection = true;
      continue;
    }
    if (!inDataSection) continue;

    const nf = (row[1] ?? '').trim();
    if (!nf || !/^\d{5,8}$/.test(nf)) continue; // Só NFs numéricos válidos

    const local = (row[7] ?? '').trim();
    if (locaisAceitos.length > 0 && !locaisAceitos.includes(local)) continue;

    const ant = Number.parseInt((row[2] ?? '').trim(), 10);
    if (!Number.isFinite(ant)) continue;

    const posto = (row[3] ?? '').trim();
    const nomeGuerra = (row[4] ?? '').trim();
    const nome = (row[5] ?? '').trim() || nomeGuerra; // fallback

    if (!posto || !nome) continue;

    const pontosStr = (row[17] ?? '').trim();
    const pontos =
      pontosStr && /^\d+$/.test(pontosStr) ? Number.parseInt(pontosStr, 10) : undefined;

    const militar: MilitarDados = {
      nf,
      ant,
      posto,
      nome,
      nomeGuerra: nomeGuerra || undefined,
      municipio: (row[6] ?? '').trim() || undefined,
      lotacao: local || undefined,
      classe: (row[8] ?? '').trim() || undefined,
      situacao: (row[12] ?? '').trim() || undefined,
      planoFerias: (row[15] ?? '').trim() || undefined,
      conceitoDisciplinar: (row[16] ?? '').trim() || undefined,
      pontos,
      cnh: (row[18] ?? '').trim() || undefined,
      cnhValidade: (row[19] ?? '').trim() || undefined,
      mergulho: (row[20] ?? '').trim() || undefined,
      ftba: (row[21] ?? '').trim() || undefined,
      censo: (row[22] ?? '').trim() || undefined,
      ccve: (row[23] ?? '').trim() || undefined,
      ccveValidade: (row[24] ?? '').trim() || undefined,
      etsp: (row[25] ?? '').trim() || undefined,
      incorporacao: (row[27] ?? '').trim() || undefined,
    };
    out.push(militar);
  }

  return out;
}

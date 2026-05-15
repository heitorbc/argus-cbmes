import { parse } from 'csv-parse/sync';
import type { IncidenteBaon } from '@argus/shared-types';

/**
 * Parser do CSV `data/incidentes_BAON_CBMES.csv`.
 *
 * Layout: header `CODIGO;DESCRICAO;CLASSIFICACAO`, separador `;`, BOM-prefixed.
 * Exemplo:
 *   Q;INCENDIO;CRIMINAL
 *   Q01;INCENDIO: EM RESIDENCIA;CRIMINAL
 *   Q01A01;INCENDIO: EM RESIDENCIA: CONGLOMERADO ...;CRIMINAL
 *
 * Tolerante a erros: pula linhas com menos de 2 colunas ou código vazio.
 */
export function parseIncidentesBaonCsv(csv: string): IncidenteBaon[] {
  const rows = parse(csv, {
    columns: false,
    delimiter: ';',
    skip_empty_lines: true,
    relax_column_count: true,
    relax_quotes: true,
    bom: true,
  }) as string[][];

  const out: IncidenteBaon[] = [];
  for (const [i, row] of rows.entries()) {
    if (i === 0) {
      // Pula header (CODIGO;DESCRICAO;CLASSIFICACAO).
      const first = (row[0] ?? '').trim().toUpperCase();
      if (first === 'CODIGO' || first === 'CÓDIGO') continue;
    }
    const codigo = (row[0] ?? '').trim();
    const descricao = (row[1] ?? '').trim();
    const classificacao = (row[2] ?? '').trim() || undefined;
    if (!codigo || !descricao) continue;
    out.push({ codigo, descricao, classificacao });
  }
  return out;
}

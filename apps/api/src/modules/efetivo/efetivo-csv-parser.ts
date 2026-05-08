import { parse } from 'csv-parse/sync';
import type { Militar } from '@argus/shared-types';

/**
 * Colunas esperadas no CSV exportado da planilha de Efetivo do Sargenteante
 * (aba "EFETIVO - DADOS GERAIS", gid=1379090962).
 *
 * O parser é tolerante a colunas extras e a colunas em ordens distintas — usa
 * lookup por nome de cabeçalho.
 */
const COL = {
  NF: 'NF',
  ANT: 'ANT.',
  POSTO: 'POS/GRAD',
  NOME: 'NOME COMPLETO',
  MUNICIPIO: 'Município',
  IDADE: 'IDADE',
  SERVICO: 'SERVIÇO',
  SITUACAO: 'PARA FINS DE',
} as const;

interface RawRow {
  [key: string]: string;
}

/** Converte um valor textual em número inteiro positivo. Retorna `undefined` se inválido. */
function toInt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const n = Number.parseInt(trimmed, 10);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function emptyToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Faz parse de um CSV completo da planilha de Efetivo e retorna a lista de Militares
 * já filtrada (sem linhas-resumo, sem NF vazio) e ordenada por ANT crescente.
 */
export function parseEfetivoCsv(csv: string): Militar[] {
  const records: RawRow[] = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  });

  const militares: Militar[] = [];
  for (const row of records) {
    const nf = emptyToUndefined(row[COL.NF]);
    const ant = toInt(row[COL.ANT]);
    const posto = emptyToUndefined(row[COL.POSTO]);
    const nome = emptyToUndefined(row[COL.NOME]);

    // Linhas válidas: precisam ter NF, ANT, posto e nome.
    // Isso descarta as linhas de resumo/total no fim da planilha.
    if (!nf || ant === undefined || !posto || !nome) {
      continue;
    }

    militares.push({
      nf,
      ant,
      posto,
      nome,
      municipio: emptyToUndefined(row[COL.MUNICIPIO]),
      idade: toInt(row[COL.IDADE]),
      servico: toInt(row[COL.SERVICO]),
      situacao: emptyToUndefined(row[COL.SITUACAO]),
    });
  }

  militares.sort((a, b) => a.ant - b.ant);
  return militares;
}

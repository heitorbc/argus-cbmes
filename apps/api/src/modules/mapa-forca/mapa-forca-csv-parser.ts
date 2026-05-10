import { parse } from 'csv-parse/sync';
import type { RecursoMapaForca, StatusVtr } from '@argus/shared-types';

/**
 * Parser do CSV exportado da aba "1º BBM" do Mapa Força.
 *
 * Layout posicional verificado em 2026-05-09:
 * - Cabeçalho institucional ocupa as ~5 primeiras linhas.
 * - Linha 6: header de colunas (`,VTR,VTR - SITUAÇÃO,VTR SEM EQUIPE,,,,,,,Nº de Militares,...`).
 * - Linha 7: subheader (`,,,,CHEFE,MOTORISTA,1,2,3,4,...`).
 * - Linhas 8-37: recursos da 1ª Cia (ABTS_01 ... PERITOS), seguidos de SOMA, EQUIPAMENTOS,
 *   observações, e depois os dados da 2ª Cia que **devem ser ignorados**.
 *
 * Estratégia: começa a leitura na primeira linha que tem `RECURSO` na col A e termina na
 * primeira ocorrência de "SOMA DE RECURSO" (final do bloco da 1ª Cia).
 */

/** Mapeia o texto da col C ("VTR - DISPONIVEL") para o enum `StatusVtr`. */
function parseStatusVtr(raw: string | undefined): StatusVtr | null {
  if (!raw) return null;
  const norm = raw.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  if (norm.includes('DISPONIVEL') || norm.includes('DISPONÍVEL')) return 'DISPONIVEL';
  if (norm.includes('BAIXADA')) return 'BAIXADA';
  if (norm.includes('EMPRESTADA')) return 'EMPRESTADA';
  if (norm.includes('NAO POSSUI') || norm.includes('NÃO POSSUI')) return 'NAO_POSSUI';
  return null;
}

/**
 * Fallback hardcoded da whitelist de recursos da 1ª Cia. Usado SOMENTE quando
 * o caller não fornece `recursosValidos` explicitamente (testes legados,
 * smoke checks). Em produção (S6d+), a whitelist vem de `RecursosService`.
 *
 * S6c/F2 — `OFICIAL DE DIA` e `PERITOS` removidos.
 * S6d/F3 — esta constante migrou para entidade `Recurso` por unidade
 * (ver `RecursosService.nomesValidos(unidadeId)`).
 */
const RECURSOS_VALIDOS_FALLBACK = new Set([
  'ABTS_01',
  'ABTS_02',
  'ATB',
  'PLATAFORMA',
  'FLORESTAL',
  'EQUIPE SATURAÇÃO',
  'RESGATE 01',
  'RESGATE 02',
  'CHEFE DE OPERAÇÕES',
  'SALVAMAR 01',
  'SALVAMAR 02',
  'QUADRICICLO 01',
  'QUADRICICLO 02',
  'MERGULHO 01',
  'MERGULHO 02',
  'REPDEC 01',
  'REPDEC 02',
  'DRO / TELEFONISTA',
  'GUARDA',
]);

function isFimDoBloco(raw: string): boolean {
  const norm = raw.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  // EQUIPAMENTOS marca o fim do bloco da 1ª Cia. SOMA DE RECURSO aparece NO MEIO
  // (entre REPDEC 02 e DRO/TELEFONISTA) e é apenas pulada — não fim.
  return norm.startsWith('EQUIPAMENTOS');
}

function isLinhaSoma(raw: string): boolean {
  const norm = raw.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  return norm.startsWith('SOMA DE RECURSO');
}

export interface ParseMapaForcaResult {
  recursos: RecursoMapaForca[];
  fiscalDoDia?: string;
  /** Avisos não-fatais (recurso desconhecido encontrado, etc.). */
  avisos: string[];
}

export interface ParseMapaForcaOptions {
  /**
   * Whitelist de recursos válidos (col A). Quando ausente, usa fallback hardcoded
   * (compat com tests legados). S6d/F3 — em produção, MapaForcaService injeta
   * o set vindo de `RecursosService.nomesValidos(unidadeId)`.
   */
  recursosValidos?: ReadonlySet<string>;
}

/**
 * Faz o parse de um CSV inteiro do Mapa Força e retorna a lista de Recursos da 1ª Cia.
 *
 * NÃO lança em layout inesperado — emite avisos. Erros fatais (CSV malformado) propagam.
 */
export function parseMapaForcaCsv(
  csv: string,
  options: ParseMapaForcaOptions = {},
): ParseMapaForcaResult {
  const recursosValidos = options.recursosValidos ?? RECURSOS_VALIDOS_FALLBACK;
  const isRecursoValido = (raw: string): boolean => recursosValidos.has(raw.trim());
  const rows = parse(csv, {
    columns: false,
    skip_empty_lines: false,
    relax_column_count: true,
    relax_quotes: true,
  }) as string[][];

  const avisos: string[] = [];
  const recursos: RecursoMapaForca[] = [];
  let fiscalDoDia: string | undefined;

  // Linha 5 do CSV (índice 4) tem "FISCAL DE SERVIÇO DO DIA, , , , 2ºSGT MARIANE,..."
  const fiscalRow = rows[4];
  if (fiscalRow) {
    const cell = (fiscalRow[4] ?? '').trim();
    if (cell.length > 0) fiscalDoDia = cell;
  }

  let dentroDoBloco = false;
  for (const row of rows) {
    const colA = (row[0] ?? '').trim();
    if (!colA) continue;

    if (!dentroDoBloco) {
      if (isRecursoValido(colA)) dentroDoBloco = true;
      else continue;
    }

    if (isFimDoBloco(colA)) break;
    if (isLinhaSoma(colA)) continue; // pula a linha SOMA no meio do bloco

    if (!isRecursoValido(colA)) {
      avisos.push(`Recurso desconhecido ignorado: "${colA}"`);
      continue;
    }

    const vtrPrefixo = (row[1] ?? '').trim() || undefined;
    const vtrStatus = parseStatusVtr((row[2] ?? '').trim());
    const semEquipe = (row[3] ?? '').trim() === '1';
    const chefe = (row[4] ?? '').trim() || undefined;
    const motorista = (row[5] ?? '').trim() || undefined;
    const operadores: string[] = [];
    for (let c = 6; c <= 9; c++) {
      const v = (row[c] ?? '').trim();
      if (v) operadores.push(v);
    }

    recursos.push({
      recurso: colA,
      vtrPrefixo,
      vtrStatus,
      semEquipe,
      chefe,
      motorista,
      operadores,
    });
  }

  return { recursos, fiscalDoDia, avisos };
}

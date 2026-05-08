import { parse } from 'csv-parse/sync';
import type { SubSecao } from '@argus/shared-types';

/**
 * Estrutura do QDI (Quadro de Distribuição Interna) — gid=558859373.
 *
 * O CSV é "planilhão" com seções por unidade (1ª Cia staff, SAT, SOS,
 * GUARDA QCG, Pelotão Aquáticas, etc.). Cada seção começa com um header
 * textual e tem militares listados abaixo até o próximo header.
 *
 * Para a 1ª Cia, as seções relevantes são (decisão Tech Lead 2026-05-08):
 *   1. "1ªCIA/1ºBBM" → subSecao 'staff'
 *   2. "SEÇÃO DE OPERAÇÕES DE SALVAMENTO (SOS)" → 'sos'
 *   3. "GUARDA QCG" → 'guarda'
 *   4. "PELOTÃO DE ATIVIDADES AQUÁTICAS" → 'aquaticas'
 *
 * Layout posicional das colunas em rows de dados (NÃO confiar no header):
 *   col 0: ANT (numérico, ou "RR ###" para reservistas — descartados)
 *   col 1: NF (chave única)
 *   col 2: código EDOCS (BM11SARG, BM11ALOG, etc.) — opcional
 *   col 3: função/descrição (ex.: "Comandante", "Sargenteante", vazio)
 *   col 4: code PREVISTO (ADM 11, PRONT 11, GUARD 11, PRONT AA, SAT 11, ...)
 *   col 5: posto previsto (SGT, CB, SD, RR, ...)
 *   col 6: posto ATUAL (2ºSGT, 1ºTEN QOC, CB, SD, ...)
 *   col 7: NOME DE GUERRA (BARCELLOS, D. MATTOS, VASSEM, ...)
 *   col 8: DESIG. (SIM ou vazio)
 *   col 12: SITUAÇÃO (APTO, FÉRIAS, ADIDO, OUTROS)
 */

export interface MilitarQdi {
  nf: string;
  ant: number;
  postoAtual: string;
  postoPrevisto?: string;
  nomeGuerra: string;
  funcao?: string;
  subSecao: SubSecao;
  unidade: string;
  situacao?: string;
}

interface SectionRule {
  /** Substring que, quando aparece em qualquer célula da row de header, identifica a seção. */
  marker: string;
  subSecao: SubSecao;
  /** Label legível usado em `unidade` no Militar. */
  unidade: string;
}

/**
 * Marcadores de início das 4 seções da 1ª Cia.
 * A ordem importa: a primeira que casar é a usada (alguns markers são prefixos uns dos outros).
 */
const CIA1_SECTIONS: SectionRule[] = [
  {
    marker: 'PELOTÃO DE ATIVIDADES AQUÁTICAS',
    subSecao: 'aquaticas',
    unidade: '1ª Cia / 1º BBM — Pelotão de Atividades Aquáticas',
  },
  {
    marker: 'SEÇÃO DE OPERAÇÕES DE SALVAMENTO',
    subSecao: 'sos',
    unidade: '1ª Cia / 1º BBM — Seção de Operações de Salvamento',
  },
  {
    marker: 'GUARDA QCG',
    subSecao: 'guarda',
    unidade: '1ª Cia / 1º BBM — Guarda QCG',
  },
  {
    marker: '1ªCIA/1ºBBM',
    subSecao: 'staff',
    unidade: '1ª Cia / 1º BBM — Comando',
  },
];

/**
 * Marcadores de seções fora da 1ª Cia (servem como "fim de seção 1ª Cia").
 * Quando o parser está dentro de uma seção da 1ª Cia e encontra um destes,
 * sai da seção (volta ao estado "fora").
 */
const NON_CIA1_SECTIONS = [
  '1ºBBM - VITÓRIA', // staff do BBM (não Cia)
  'SECRETARIA DO COMANDO',
  'SAT - VITÓRIA',
  'MILITARES EM EXCESSO',
  'AFASTADOS',
  'RESUMO 1ºBBM',
  'QUADRO DE VAGAS',
];

function rowAsString(row: string[]): string {
  return row.join(' ').toUpperCase();
}

function detectSection(row: string[]): SectionRule | null {
  const upper = rowAsString(row);
  for (const rule of CIA1_SECTIONS) {
    if (upper.includes(rule.marker.toUpperCase())) return rule;
  }
  return null;
}

function isNonCia1Header(row: string[]): boolean {
  const upper = rowAsString(row);
  return NON_CIA1_SECTIONS.some((m) => upper.includes(m.toUpperCase()));
}

function isEmpty(value: string | undefined): boolean {
  if (!value) return true;
  const t = value.trim();
  return t.length === 0 || t === '--';
}

function trimOrUndefined(v: string | undefined): string | undefined {
  if (!v) return undefined;
  const t = v.trim();
  return t.length > 0 && t !== '--' ? t : undefined;
}

function parseAnt(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const t = raw.trim();
  if (!t) return undefined;
  // "RR 103" e similares → reservistas, descartar
  if (/^RR\b/i.test(t)) return undefined;
  const n = Number.parseInt(t, 10);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/**
 * Faz parse do CSV completo do QDI e retorna apenas militares ativos da 1ª Cia,
 * agrupados por sub-seção.
 */
export function parseQdiCsv(csv: string): MilitarQdi[] {
  // QDI tem header inconsistente (várias seções, headers parciais).
  // Usamos parse posicional, sem cabeçalho.
  const rows: string[][] = parse(csv, {
    columns: false,
    skip_empty_lines: false,
    relax_column_count: true,
    relax_quotes: true,
    trim: false,
  });

  const out: MilitarQdi[] = [];
  let currentSection: SectionRule | null = null;

  for (const row of rows) {
    const allEmpty = row.every(isEmpty);
    if (allEmpty) {
      // Linhas em branco não rompem a seção (algumas seções têm sub-grupos com row vazia entre).
      continue;
    }

    // Tenta detectar header de seção (1ª Cia ou outro)
    const cia1 = detectSection(row);
    if (cia1) {
      currentSection = cia1;
      continue;
    }
    if (isNonCia1Header(row)) {
      currentSection = null;
      continue;
    }

    if (!currentSection) continue;

    // Row de dados dentro de uma seção da 1ª Cia
    const ant = parseAnt(row[0]);
    const nf = trimOrUndefined(row[1]);
    const postoAtual = trimOrUndefined(row[6]);
    const nomeGuerra = trimOrUndefined(row[7]);

    // Filtros mínimos: NF, ANT numérico, posto e nome de guerra não-`--`
    if (!nf || ant === undefined || !postoAtual || !nomeGuerra) continue;

    out.push({
      nf,
      ant,
      postoAtual,
      postoPrevisto: trimOrUndefined(row[5]),
      nomeGuerra,
      funcao: trimOrUndefined(row[3]),
      subSecao: currentSection.subSecao,
      unidade: currentSection.unidade,
      situacao: trimOrUndefined(row[12]),
    });
  }

  return out;
}

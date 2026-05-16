import type {
  ComposicaoEntry,
  EscalaEspecialAto,
  EscalaEspecialMensal,
  EscalaMensal,
  LetraEquipeRotativa,
  NotaServico,
} from '@argus/shared-types';
import { quinzenaDoDia } from '../escalas/escalas.service';
import { parseMilitarCell } from '../escalas/escala-xlsx-parser';

/**
 * Serializadores entre as estruturas do domínio e linhas string[] das
 * abas do Sheets-DB. Usados pelos services para dual-write.
 *
 * Cada função tem um inverso (`*ToRows` ↔ `rowsTo*`) para permitir
 * round-trip e bootstrap a partir do Sheets-DB. Note que round-trip
 * NÃO é fiel 100% — campos como `avisos`, `mergulho`, `salvamar`
 * ficam fora da serialização porque a UI atual não consome via
 * Sheets-DB. Para fidelidade total, manter o XLSX como fonte primária
 * e o Sheets-DB como espelho/cache.
 */

// ── EscalaMensal ──────────────────────────────────────────────────

/**
 * Desnormaliza uma EscalaMensal em N linhas, uma por (data × militar
 * escalado). A coluna `recurso` é preenchida com o nome da viatura
 * (no domínio atual recurso ≈ viatura).
 *
 * Layout das colunas (12) — bate com SHEETS.ESCALA_MENSAL.headers:
 *   ano | mes | data | equipe | recurso | viatura | funcao |
 *   militarRaw | militarNf | origemArquivo | importadoEm | importadoPorNf
 */
export function escalaMensalToRows(escala: EscalaMensal): string[][] {
  const rows: string[][] = [];
  const ano = String(escala.ano);
  const mes = String(escala.mes);
  const origem = escala.origemArquivo;
  const importadoEm = escala.importadoEm;
  const importadoPorNf = escala.importadoPorNf ?? '';

  for (const [dataIso, equipe] of Object.entries(escala.diaEquipe)) {
    if (!equipe) continue;
    const q = quinzenaDoDia(dataIso, escala);
    const bucket =
      q === 1 ? escala.composicaoPorQuinzena.q1 : escala.composicaoPorQuinzena.q2;
    const entries = bucket.filter((c) => c.equipe === equipe);
    for (const e of entries) {
      rows.push([
        ano,
        mes,
        dataIso,
        equipe,
        e.viatura, // recurso ≈ viatura no domínio atual
        e.viatura,
        e.funcao,
        e.militar.raw,
        e.militar.nf ?? '',
        origem,
        importadoEm,
        importadoPorNf,
      ]);
    }
  }
  return rows;
}

/**
 * S2.8.2 — Reagrupa rows do Sheets-DB de volta em EscalaMensal por (ano, mes).
 *
 * Limitações conhecidas (perda de fidelidade no round-trip):
 *   - `avisos`, `mergulho`, `salvamar` ficam vazios (não serializados).
 *   - `composicaoPorQuinzena.ultimoDiaQ1` é inferido (default 14): rows
 *     do dia 1-14 vão para q1, dia 15+ vão para q2. Suficiente para a
 *     maioria dos casos institucionais.
 *
 * Retorna `Map<key, EscalaMensal>` onde key = "YYYY-MM". O caller decide
 * o que fazer com cada mês.
 */
export function rowsToEscalasMensais(rows: string[][]): Map<string, EscalaMensal> {
  const porMes = new Map<string, string[][]>();
  for (const row of rows) {
    const ano = row[0] ?? '';
    const mes = row[1] ?? '';
    if (!ano || !mes) continue;
    const key = `${ano}-${mes.padStart(2, '0')}`;
    const arr = porMes.get(key);
    if (arr) arr.push(row);
    else porMes.set(key, [row]);
  }
  const out = new Map<string, EscalaMensal>();
  for (const [key, mesRows] of porMes.entries()) {
    const escala = rowsToEscalaMensal(mesRows);
    if (escala) out.set(key, escala);
  }
  return out;
}

/**
 * Reagrupa rows de UM mês em EscalaMensal. Assume que todas as rows são
 * do mesmo (ano, mes); caller é responsável por filtrar antes.
 */
export function rowsToEscalaMensal(rows: string[][]): EscalaMensal | null {
  if (rows.length === 0) return null;
  const first = rows[0]!;
  const ano = Number.parseInt(first[0] ?? '', 10);
  const mes = Number.parseInt(first[1] ?? '', 10);
  if (!Number.isFinite(ano) || !Number.isFinite(mes)) return null;

  const diaEquipe: Record<string, LetraEquipeRotativa> = {};
  const q1: ComposicaoEntry[] = [];
  const q2: ComposicaoEntry[] = [];
  const q1Keys = new Set<string>(); // dedup por (equipe|viatura|funcao|militarRaw)
  const q2Keys = new Set<string>();

  let origemArquivo = '';
  let importadoEm = '';
  let importadoPorNf: string | undefined;

  for (const row of rows) {
    const data = row[2] ?? '';
    const equipe = (row[3] ?? '') as LetraEquipeRotativa;
    const viatura = row[5] ?? '';
    const funcao = row[6] ?? '';
    const militarRaw = row[7] ?? '';
    const militarNf = row[8] ?? '';
    if (!data || !equipe) continue;
    diaEquipe[data] = equipe;

    if (!origemArquivo && row[9]) origemArquivo = row[9];
    if (!importadoEm && row[10]) importadoEm = row[10];
    if (!importadoPorNf && row[11]) importadoPorNf = row[11];

    if (!viatura || !funcao || !militarRaw) continue;
    // S2.8.x bugfix — reusa o `parseMilitarCell` do parser XLSX para
    // popular `postoAbreviado` e `nomeGuerra` a partir do raw. Antes
    // ficavam vazios, quebrando o NomeMatcher e impedindo a Agenda /
    // Mapa Força de associar a escala ao Efetivo.
    const militarParseado = parseMilitarCell(militarRaw);
    const militar = militarParseado
      ? { ...militarParseado, nf: militarNf || militarParseado.nf || undefined }
      : {
          raw: militarRaw,
          postoAbreviado: '',
          nomeGuerra: militarRaw,
          nf: militarNf || undefined,
        };
    const entry: ComposicaoEntry = {
      equipe,
      viatura,
      funcao,
      militar,
    };
    const dia = Number.parseInt(data.slice(8, 10), 10);
    const ultimoDiaQ1 = 14;
    const bucket = dia <= ultimoDiaQ1 ? q1 : q2;
    const seen = dia <= ultimoDiaQ1 ? q1Keys : q2Keys;
    const k = `${equipe}|${viatura}|${funcao}|${militarRaw}`;
    if (seen.has(k)) continue;
    seen.add(k);
    bucket.push(entry);
  }

  return {
    ano,
    mes,
    origemArquivo: origemArquivo || `sheets-db:${ano}-${String(mes).padStart(2, '0')}`,
    importadoEm: importadoEm || new Date().toISOString(),
    importadoPorNf,
    diaEquipe,
    composicaoPorQuinzena: { q1, q2, ultimoDiaQ1: 14 },
    avisos: [],
  };
}

// ── EscalaEspecialMensal ──────────────────────────────────────────

/**
 * Cada `ato` vira 1 linha. Layout (10):
 *   ano | mes | data | militarRaw | militarNf | horario | funcao |
 *   origemArquivo | importadoEm | importadoPorNf
 */
export function escalaEspecialToRows(escala: EscalaEspecialMensal): string[][] {
  const ano = String(escala.ano);
  const mes = String(escala.mes);
  const origem = escala.origemArquivo;
  const importadoEm = escala.importadoEm;
  const importadoPorNf = escala.importadoPorNf ?? '';

  return escala.atos.map((a) => [
    ano,
    mes,
    a.data,
    a.militarRaw,
    a.militarNf ?? '',
    a.horario,
    a.funcao,
    origem,
    importadoEm,
    importadoPorNf,
  ]);
}

/**
 * S2.8.2 — Reagrupa rows do Sheets-DB de volta em EscalaEspecialMensal por
 * (ano, mes). Mais simples que a mensal porque `atos[]` é flat.
 */
export function rowsToEscalasEspeciais(
  rows: string[][],
): Map<string, EscalaEspecialMensal> {
  const porMes = new Map<string, string[][]>();
  for (const row of rows) {
    const ano = row[0] ?? '';
    const mes = row[1] ?? '';
    if (!ano || !mes) continue;
    const key = `${ano}-${mes.padStart(2, '0')}`;
    const arr = porMes.get(key);
    if (arr) arr.push(row);
    else porMes.set(key, [row]);
  }
  const out = new Map<string, EscalaEspecialMensal>();
  for (const [key, mesRows] of porMes.entries()) {
    const escala = rowsToEscalaEspecial(mesRows);
    if (escala) out.set(key, escala);
  }
  return out;
}

export function rowsToEscalaEspecial(rows: string[][]): EscalaEspecialMensal | null {
  if (rows.length === 0) return null;
  const first = rows[0]!;
  const ano = Number.parseInt(first[0] ?? '', 10);
  const mes = Number.parseInt(first[1] ?? '', 10);
  if (!Number.isFinite(ano) || !Number.isFinite(mes)) return null;

  let origemArquivo = '';
  let importadoEm = '';
  let importadoPorNf: string | undefined;

  const atos: EscalaEspecialAto[] = [];
  for (const row of rows) {
    const data = row[2] ?? '';
    const militarRaw = row[3] ?? '';
    const militarNf = row[4] ?? '';
    const horario = row[5] ?? '';
    const funcao = row[6] ?? '';
    if (!data || !militarRaw) continue;

    if (!origemArquivo && row[7]) origemArquivo = row[7];
    if (!importadoEm && row[8]) importadoEm = row[8];
    if (!importadoPorNf && row[9]) importadoPorNf = row[9];

    atos.push({
      data,
      militarRaw,
      militarNf: militarNf || undefined,
      horario,
      funcao,
    });
  }

  return {
    ano,
    mes,
    origemArquivo: origemArquivo || `sheets-db:${ano}-${String(mes).padStart(2, '0')}`,
    importadoEm: importadoEm || new Date().toISOString(),
    importadoPorNf,
    atos,
    avisos: [],
  };
}

// ── NotaServico ───────────────────────────────────────────────────

/**
 * Layout (11):
 *   id | codigo | descricao | data | horaInicio | horaFim |
 *   viaturaPrefixo | militaresNfs (|-separado) | observacoes |
 *   criadoEm | criadoPorNf
 */
export function notaServicoToRow(ns: NotaServico): string[] {
  return [
    ns.id,
    ns.codigo,
    ns.descricao,
    ns.data,
    ns.horaInicio,
    ns.horaFim,
    ns.viaturaPrefixo ?? '',
    ns.militaresNfs.join('|'),
    ns.observacoes ?? '',
    ns.criadoEm,
    ns.criadoPorNf,
  ];
}

export function rowToNotaServico(row: string[]): NotaServico | null {
  if (row.length < 11) return null;
  const [id, codigo, descricao, data, horaInicio, horaFim, vtr, nfs, obs, criadoEm, criadoPorNf] =
    row;
  if (!id || !codigo || !data) return null;
  return {
    id,
    codigo,
    descricao: descricao ?? '',
    data,
    horaInicio: horaInicio ?? '',
    horaFim: horaFim ?? '',
    viaturaPrefixo: vtr ? vtr : undefined,
    militaresNfs: (nfs ?? '').split('|').filter(Boolean),
    observacoes: obs ? obs : undefined,
    criadoEm: criadoEm ?? new Date().toISOString(),
    criadoPorNf: criadoPorNf ?? '',
  };
}

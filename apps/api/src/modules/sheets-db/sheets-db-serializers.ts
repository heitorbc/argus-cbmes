import type {
  EscalaEspecialMensal,
  EscalaMensal,
  NotaServico,
} from '@argus/shared-types';
import { quinzenaDoDia } from '../escalas/escalas.service';

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

import {
  PERIODO_TROCA_PREDEFINIDO,
  PERIODO_TROCA_PREDEFINIDO_LABEL,
  type PeriodoTroca,
  type PeriodoTrocaPredefinido,
} from '@argus/shared-types';

/**
 * S6h/1.1 — Helpers para o campo de período da troca.
 *
 * O backend aceita 2 formatos: legacy (string livre, do S5) ou novo
 * (`PeriodoTroca` discriminated union). Aqui normalizamos para apresentação.
 */

export const PERIODO_TROCA_OPCOES: Array<{ value: PeriodoTrocaPredefinido; label: string }> =
  PERIODO_TROCA_PREDEFINIDO.map((v) => ({
    value: v,
    label: PERIODO_TROCA_PREDEFINIDO_LABEL[v],
  }));

/** Retorna texto legível para qualquer formato suportado de período. */
export function periodoToLabel(p: string | PeriodoTroca | undefined): string {
  if (!p) return '';
  if (typeof p === 'string') return p; // legacy
  if (p.tipo === 'predefinido') return PERIODO_TROCA_PREDEFINIDO_LABEL[p.valor];
  return `${p.horaInicio} às ${p.horaFim}`;
}

/**
 * Normaliza string legacy → PeriodoTroca (best-effort). Retorna `null` se não
 * conseguir mapear (caller usa fallback default).
 */
export function legacyStringToPeriodo(s: string): PeriodoTroca | null {
  const norm = s.trim().toLowerCase();
  if (norm === '24h' || norm === '24 h' || norm === '24horas') {
    return { tipo: 'predefinido', valor: 'TURNO_24H' };
  }
  if (norm.includes('matutin')) return { tipo: 'predefinido', valor: 'MATUTINO_6H' };
  if (norm.includes('vespertin')) return { tipo: 'predefinido', valor: 'VESPERTINO_6H' };
  if (norm.includes('noturn') && norm.includes('12')) {
    return { tipo: 'predefinido', valor: 'NOTURNO_12H' };
  }
  if (norm.includes('diurn') && norm.includes('12')) {
    return { tipo: 'predefinido', valor: 'DIURNO_12H' };
  }
  // Tenta extrair "HH:MM às HH:MM"
  const m = norm.match(/(\d{2}:\d{2})\s*(?:às|as|-)\s*(\d{2}:\d{2})/);
  if (m) return { tipo: 'custom', horaInicio: m[1]!, horaFim: m[2]! };
  return null;
}

/** Default seguro para uma nova troca: turno 24h. */
export const PERIODO_TROCA_DEFAULT: PeriodoTroca = { tipo: 'predefinido', valor: 'TURNO_24H' };

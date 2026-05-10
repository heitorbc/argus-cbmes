import type { StatusConferenciaEquipe } from '@argus/shared-types';

/**
 * S6h/2.1 — Paleta de cores para o badge "status por equipe" na tela de
 * Conferência da Equipe.
 *
 *   - `nao_conferida`: cinza (slate)
 *   - `em_conferencia`: âmbar (em andamento)
 *   - `conferida`: verde forte (concluída)
 *
 * Mantém coerência com `STATUS_VIATURA_BADGE` (S6c/F3) — verde para
 * "ok/disponível", âmbar para "atenção", cinza/escuro para "negativo".
 */
export const STATUS_CONFERENCIA_EQUIPE_BADGE: Record<StatusConferenciaEquipe, string> = {
  nao_conferida: 'bg-slate-300 text-slate-800',
  em_conferencia: 'bg-amber-500 text-white',
  conferida: 'bg-emerald-500 text-white',
};

export const STATUS_CONFERENCIA_EQUIPE_CARD: Record<StatusConferenciaEquipe, string> = {
  nao_conferida: 'border-slate-300 bg-white',
  em_conferencia: 'border-amber-400 bg-amber-50',
  conferida: 'border-emerald-500 bg-emerald-50',
};

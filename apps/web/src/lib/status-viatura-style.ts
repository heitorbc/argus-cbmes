import type { StatusViatura } from '@argus/shared-types';

/**
 * Paleta única de cores de status de viatura (S6c/F3).
 *
 * Cores fortes para alta visibilidade em mobile (Tech Lead pediu cores
 * fortes para facilitar identificação à distância). Tailwind defaults
 * com bom contraste WCAG AA:
 *
 * - DISPONIVEL: verde forte (operacional, ok)
 * - BAIXADA: vermelho forte (atenção, indisponível)
 * - EMPRESTADA: âmbar forte (info, fora da casa)
 */

/** Badge forte (bg colorido + texto branco) — para uso em listas/cards. */
export const STATUS_VIATURA_BADGE: Record<StatusViatura, string> = {
  DISPONIVEL: 'bg-emerald-500 text-white',
  BAIXADA: 'bg-red-600 text-white',
  EMPRESTADA: 'bg-amber-500 text-white',
};

/** Variante claro (bg-XXX-50 + border + texto escuro) — para card grande/grid. */
export const STATUS_VIATURA_CARD: Record<StatusViatura, string> = {
  DISPONIVEL: 'border-emerald-500 bg-emerald-50 text-emerald-900',
  BAIXADA: 'border-red-500 bg-red-50 text-red-900',
  EMPRESTADA: 'border-amber-500 bg-amber-50 text-amber-900',
};

/** Apenas a cor sólida do background (sem texto) — para barras/dots. */
export const STATUS_VIATURA_BG: Record<StatusViatura, string> = {
  DISPONIVEL: 'bg-emerald-500',
  BAIXADA: 'bg-red-600',
  EMPRESTADA: 'bg-amber-500',
};

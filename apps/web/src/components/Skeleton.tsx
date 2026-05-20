/**
 * S2.10.9c — Skeleton placeholders para substituir o "Carregando…" textual.
 * Variantes: linha (paragraph), card (block), tabela (rows × cols).
 *
 * Uso prático: aparece durante o 1º load (sem cache) ou refetch após
 * invalidate. Quando há cache hidratado do localStorage, a UI já vem com
 * dados — skeleton só aparece no cold start absoluto.
 */
import type { JSX } from 'react';

interface SkeletonProps {
  className?: string;
  rounded?: boolean;
}

export function Skeleton({ className = '', rounded = true }: SkeletonProps): JSX.Element {
  return (
    <div
      className={`animate-pulse bg-slate-200 ${rounded ? 'rounded' : ''} ${className}`}
      aria-hidden="true"
    />
  );
}

interface SkeletonLinesProps {
  lines?: number;
  className?: string;
}

/** Linhas de altura padrão simulando parágrafo. */
export function SkeletonLines({ lines = 3, className = '' }: SkeletonLinesProps): JSX.Element {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={`h-3 ${i === lines - 1 ? 'w-3/4' : 'w-full'}`} />
      ))}
    </div>
  );
}

interface SkeletonTableProps {
  rows?: number;
  cols?: number;
  className?: string;
}

/** Bloco de tabela com linhas e colunas (uso em listas). */
export function SkeletonTable({
  rows = 5,
  cols = 4,
  className = '',
}: SkeletonTableProps): JSX.Element {
  return (
    <div className={`overflow-hidden rounded border border-slate-200 bg-white ${className}`}>
      <div className="border-b border-slate-200 bg-slate-100 px-3 py-2">
        <div className="flex gap-3">
          {Array.from({ length: cols }).map((_, i) => (
            <Skeleton key={`h-${i}`} className="h-3 w-20" />
          ))}
        </div>
      </div>
      <div>
        {Array.from({ length: rows }).map((_, r) => (
          <div
            key={`r-${r}`}
            className="flex gap-3 border-b border-slate-100 px-3 py-2 last:border-0"
          >
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton key={`c-${r}-${c}`} className={`h-3 ${c === 0 ? 'w-24' : 'w-16'}`} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

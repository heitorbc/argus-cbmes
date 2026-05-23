import type { ReactNode } from 'react';

/**
 * S2.10.12b — Container reusável para sidebar de filtros no modo WEB.
 * Pattern: grupo de filtros agrupados em <details> collapsible com
 * botão "Limpar tudo" no topo.
 *
 * Filhos são livres (qualquer JSX). Os grupos são montados via
 * `FilterGroup` (sub-componente exportado).
 */
export interface FilterSidebarProps {
  /** Título principal da sidebar (ex.: "Filtros"). */
  title?: string;
  /** Total de filtros ativos — quando >0 mostra botão "Limpar". */
  activeCount?: number;
  /** Callback ao clicar "Limpar tudo". */
  onClear?: () => void;
  children: ReactNode;
  className?: string;
}

export function FilterSidebar({
  title = 'Filtros',
  activeCount = 0,
  onClear,
  children,
  className = '',
}: FilterSidebarProps) {
  return (
    <aside
      className={`flex h-full w-72 flex-shrink-0 flex-col border-r border-slate-200 bg-white ${className}`}
    >
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">{title}</h2>
        {activeCount > 0 && onClear && (
          <button
            type="button"
            onClick={onClear}
            className="text-xs font-medium text-cbmes-blue hover:underline"
          >
            Limpar ({activeCount})
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">{children}</div>
    </aside>
  );
}

/**
 * Grupo de filtros collapsible. Mantém estado de aberto/fechado interno
 * via <details> nativo (sem JS extra).
 */
export interface FilterGroupProps {
  label: string;
  children: ReactNode;
  /** Quando true, o grupo começa aberto. Default = `true`. */
  defaultOpen?: boolean;
}

export function FilterGroup({ label, children, defaultOpen = true }: FilterGroupProps) {
  return (
    <details open={defaultOpen} className="group border-b border-slate-100">
      <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 hover:bg-slate-50">
        <span>{label}</span>
        <span aria-hidden className="text-slate-400 transition group-open:rotate-90">
          ›
        </span>
      </summary>
      <div className="px-4 pb-3">{children}</div>
    </details>
  );
}

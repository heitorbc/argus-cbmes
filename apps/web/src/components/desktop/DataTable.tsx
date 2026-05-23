import { useMemo, useState, type ReactNode } from 'react';

/**
 * S2.10.12b — Tabela reusável para o modo WEB. Suporta:
 *  - Sort por coluna (header clicável quando `sortable: true`)
 *  - Sticky header (scroll vertical mostra cabeçalho fixo)
 *  - Hover row highlight
 *  - Click row callback (master-detail / open modal)
 *  - Selection multi-row (checkbox opcional via `selectable`)
 *  - Empty state customizável
 *  - Skeleton durante loading
 *
 * Não persiste sort/filtros — caller decide se quer salvar em URL
 * params ou localStorage (`ARGUS_WEB_TABLE_PREFS_*`).
 */
export interface ColumnDef<T> {
  /** Identificador único da coluna (usado como key + para sort state). */
  key: string;
  /** Texto do header. */
  label: string;
  /** Função que extrai o valor renderizável de cada row. */
  render: (row: T, index: number) => ReactNode;
  /** Função opcional para sort (retorna comparável). Default = não sortável. */
  sortValue?: (row: T) => string | number;
  /** Largura fixa opcional (ex.: `'120px'`, `'10%'`). */
  width?: string;
  /** Alinhamento horizontal. Default = `'left'`. */
  align?: 'left' | 'center' | 'right';
  /** Classes Tailwind extra na <td>. */
  cellClassName?: string;
}

export interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  data: T[];
  /** Chave única para identificar cada row (usado como React key + selection). */
  rowKey: (row: T) => string;
  /** Callback ao clicar numa linha (master-detail/open inspector). */
  onRowClick?: (row: T) => void;
  /** Quando true, mostra checkbox na 1ª coluna + barra de selection. */
  selectable?: boolean;
  /** Quando true, mostra skeleton em vez do conteúdo. */
  loading?: boolean;
  /** Mensagem quando `data.length === 0` (não loading). */
  emptyState?: ReactNode;
  /** Sort inicial. */
  initialSort?: { key: string; dir: 'asc' | 'desc' };
  /** Função para destacar visualmente uma linha (ex.: selecionada). */
  highlightRow?: (row: T) => boolean;
  className?: string;
}

export function DataTable<T>({
  columns,
  data,
  rowKey,
  onRowClick,
  selectable = false,
  loading = false,
  emptyState,
  initialSort,
  highlightRow,
  className = '',
}: DataTableProps<T>) {
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(
    initialSort ?? null,
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const sorted = useMemo(() => {
    if (!sort) return data;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return data;
    const arr = [...data];
    arr.sort((a, b) => {
      const va = col.sortValue!(a);
      const vb = col.sortValue!(b);
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [data, sort, columns]);

  const toggleSort = (key: string) => {
    setSort((cur) => {
      if (cur?.key !== key) return { key, dir: 'asc' };
      if (cur.dir === 'asc') return { key, dir: 'desc' };
      return null;
    });
  };

  const toggleRow = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allSelected =
    selectable && sorted.length > 0 && sorted.every((r) => selected.has(rowKey(r)));
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(sorted.map(rowKey)));
  };

  return (
    <div className={`overflow-hidden rounded-lg border border-slate-200 bg-white ${className}`}>
      {selectable && selected.size > 0 && (
        <div className="border-b border-slate-200 bg-cbmes-blue/5 px-4 py-2 text-sm text-cbmes-blue">
          <strong>{selected.size}</strong> selecionado{selected.size === 1 ? '' : 's'}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="sticky top-0 z-10 bg-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-600">
            <tr>
              {selectable && (
                <th className="w-10 px-3 py-2 text-left">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label="Selecionar todas"
                    className="h-4 w-4 accent-cbmes-blue"
                  />
                </th>
              )}
              {columns.map((col) => {
                const active = sort?.key === col.key;
                const sortable = !!col.sortValue;
                return (
                  <th
                    key={col.key}
                    style={col.width ? { width: col.width } : undefined}
                    className={`px-3 py-2 ${alignClass(col.align)} ${
                      sortable ? 'cursor-pointer select-none hover:text-cbmes-blue' : ''
                    }`}
                    onClick={sortable ? () => toggleSort(col.key) : undefined}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.label}
                      {sortable && (
                        <span aria-hidden className="text-[10px] opacity-70">
                          {active ? (sort.dir === 'asc' ? '▲' : '▼') : '⇅'}
                        </span>
                      )}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading
              ? renderSkeleton(columns.length + (selectable ? 1 : 0))
              : sorted.length === 0
                ? renderEmpty(columns.length + (selectable ? 1 : 0), emptyState)
                : sorted.map((row, idx) => {
                    const id = rowKey(row);
                    const highlight = highlightRow?.(row);
                    return (
                      <tr
                        key={id}
                        onClick={onRowClick ? () => onRowClick(row) : undefined}
                        className={`transition ${onRowClick ? 'cursor-pointer' : ''} ${
                          highlight
                            ? 'bg-cbmes-blue/10 hover:bg-cbmes-blue/15'
                            : 'hover:bg-slate-50'
                        }`}
                      >
                        {selectable && (
                          <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selected.has(id)}
                              onChange={() => toggleRow(id)}
                              aria-label={`Selecionar linha ${idx + 1}`}
                              className="h-4 w-4 accent-cbmes-blue"
                            />
                          </td>
                        )}
                        {columns.map((col) => (
                          <td
                            key={col.key}
                            className={`px-3 py-2 ${alignClass(col.align)} ${col.cellClassName ?? ''}`}
                          >
                            {col.render(row, idx)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function alignClass(align?: 'left' | 'center' | 'right'): string {
  if (align === 'center') return 'text-center';
  if (align === 'right') return 'text-right';
  return 'text-left';
}

function renderSkeleton(cols: number): ReactNode {
  return Array.from({ length: 8 }).map((_, i) => (
    <tr key={`skel-${i}`} className="animate-pulse">
      {Array.from({ length: cols }).map((__, j) => (
        <td key={j} className="px-3 py-3">
          <div className="h-4 w-full max-w-xs rounded bg-slate-200" />
        </td>
      ))}
    </tr>
  ));
}

function renderEmpty(cols: number, emptyState: ReactNode): ReactNode {
  return (
    <tr>
      <td colSpan={cols} className="px-3 py-12 text-center text-sm text-slate-500">
        {emptyState ?? 'Nenhum item encontrado.'}
      </td>
    </tr>
  );
}

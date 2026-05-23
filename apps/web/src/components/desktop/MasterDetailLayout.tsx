import type { ReactNode } from 'react';

/**
 * S2.10.12b — Layout horizontal padronizado para master-detail no
 * modo WEB. Master à esquerda (lista de itens), detail à direita
 * (conteúdo do item selecionado). Largura do master configurável.
 *
 * Cada zona tem scroll independente (h-full + overflow-y-auto). Ideal
 * para Escalas, Efetivo, Mapa Força, qualquer browse + inspect.
 */
export interface MasterDetailLayoutProps {
  /** Conteúdo da coluna esquerda (lista, navegação). */
  master: ReactNode;
  /** Conteúdo da coluna direita (detalhes do item selecionado). */
  detail: ReactNode;
  /** Largura fixa do master. Default = `'320px'`. */
  masterWidth?: string;
  /** Classes Tailwind extras no container raiz. */
  className?: string;
  /** Conteúdo opcional acima das duas colunas (ex.: barra de filtros). */
  toolbar?: ReactNode;
}

export function MasterDetailLayout({
  master,
  detail,
  masterWidth = '320px',
  className = '',
  toolbar,
}: MasterDetailLayoutProps) {
  return (
    <div className={`flex h-full flex-col ${className}`}>
      {toolbar && (
        <div className="flex-shrink-0 border-b border-slate-200 bg-white px-4 py-2">{toolbar}</div>
      )}
      <div className="flex flex-1 overflow-hidden">
        <aside
          className="flex-shrink-0 overflow-y-auto border-r border-slate-200 bg-white"
          style={{ width: masterWidth }}
        >
          {master}
        </aside>
        <section className="flex-1 overflow-y-auto bg-slate-50">{detail}</section>
      </div>
    </div>
  );
}

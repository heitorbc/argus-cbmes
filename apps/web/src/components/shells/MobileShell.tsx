import { Link, useLocation } from 'react-router-dom';
import { Outlet } from 'react-router-dom';
import { ModeToggleButton } from '@/components/ModeToggleButton';

/**
 * S2.10.12 — Shell para o modo MOBILE. Envolve as páginas existentes
 * sem alterar seu conteúdo interno: cada página continua definindo seu
 * próprio `<header>` institucional pesado quando precisar (ex.: home),
 * mas o shell injeta o `ModeToggleButton` num cantinho fixo (topo-direito)
 * para que o usuário sempre tenha como trocar para WEB.
 *
 * Posição absoluta no canto: minimamente invasiva (não muda o layout
 * das páginas). Pode ser refinado depois para integrar no header de
 * cada página se for incômodo.
 */
export function MobileShell() {
  const location = useLocation();
  // No mode-picker, não mostra o botão de troca (estaria recursivo).
  const hideToggle = location.pathname === '/escolher-modo';

  return (
    <>
      {!hideToggle && (
        <div className="fixed right-2 top-2 z-50">
          <ModeToggleButton
            variant="compact"
            className="bg-cbmes-red/80 text-white shadow-md backdrop-blur"
          />
        </div>
      )}
      <Outlet />
      {/* Skip link para acessibilidade (Tab vai pro conteúdo). */}
      <Link
        to="#conteudo-principal"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-button focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:shadow"
      >
        Pular para o conteúdo
      </Link>
    </>
  );
}

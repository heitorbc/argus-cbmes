import { useAuth } from '@/lib/auth-context';
import { StatusBar } from './StatusBar';

/**
 * S2.10.13a — Rodapé global pós-login com a mesma apresentação de status
 * que existe na home (variant compact). Mantém os 3 dots (API, Mapa
 * Força CIODES, Supabase) sempre visíveis enquanto o militar navega.
 *
 * Renderizado apenas quando há usuário autenticado — em telas públicas
 * (login, esqueci-a-senha, reset-password) o StatusBar full continua
 * no corpo da página.
 */
export function Footer() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <footer className="border-t border-slate-200 bg-white/95 px-3 py-1.5 text-[10px] text-slate-500 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
        <span className="hidden text-[10px] uppercase tracking-wider text-slate-400 sm:inline">
          ARGUS CBMES
        </span>
        <StatusBar variant="compact" />
      </div>
    </footer>
  );
}

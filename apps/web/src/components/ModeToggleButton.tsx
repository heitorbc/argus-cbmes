import { useUIMode, type UIMode } from '@/lib/ui-mode';

/**
 * S2.10.12 — Botão para trocar entre modos MOBILE e WEB. Sempre visível
 * no header de cada shell. Click pede confirmação leve via window.confirm
 * (evita troca acidental no meio de um formulário) e dispara reload —
 * o `router.tsx` re-roteia para o shell correto baseado no novo `mode`.
 *
 * Variantes:
 *  - `compact`: ícone único 📱/🖥️ (usado no header mobile pequeno)
 *  - `full`: ícone + texto "Modo WEB" / "Modo MOBILE" (topbar desktop)
 */
interface ModeToggleButtonProps {
  variant?: 'compact' | 'full';
  className?: string;
}

const OUTRO_MODO_LABEL: Record<UIMode, string> = {
  mobile: 'Modo MOBILE',
  web: 'Modo WEB',
};

const OUTRO_MODO_ICON: Record<UIMode, string> = {
  mobile: '📱',
  web: '🖥️',
};

export function ModeToggleButton({ variant = 'compact', className = '' }: ModeToggleButtonProps) {
  const { mode, setMode } = useUIMode();
  if (!mode) return null; // mode-picker ainda não escolheu

  const outro: UIMode = mode === 'web' ? 'mobile' : 'web';

  const handleClick = () => {
    const confirmed = window.confirm(`Trocar para ${OUTRO_MODO_LABEL[outro]}?`);
    if (!confirmed) return;
    setMode(outro);
    // Reload garante que o router re-monte a árvore com o shell certo
    // sem precisar coordenar transições parciais.
    window.location.reload();
  };

  if (variant === 'compact') {
    return (
      <button
        type="button"
        onClick={handleClick}
        title={`Trocar para ${OUTRO_MODO_LABEL[outro]}`}
        aria-label={`Trocar para ${OUTRO_MODO_LABEL[outro]}`}
        className={`rounded-button p-1.5 text-base hover:bg-white/10 ${className}`}
      >
        <span aria-hidden>{OUTRO_MODO_ICON[outro]}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      title={`Trocar para ${OUTRO_MODO_LABEL[outro]}`}
      className={`inline-flex items-center gap-2 rounded-button px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 ${className}`}
    >
      <span aria-hidden>{OUTRO_MODO_ICON[outro]}</span>
      <span>{OUTRO_MODO_LABEL[outro]}</span>
    </button>
  );
}

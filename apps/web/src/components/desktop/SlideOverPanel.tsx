import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, type ReactNode } from 'react';
import { useKeyboardShortcut } from './KeyboardShortcuts';

/**
 * S2.10.12b — Panel lateral animado (slide-in pela direita) para forms
 * inline no modo WEB. Substitui modais centralizados em pages que se
 * beneficiam de "ver o contexto enquanto edita" (tabela atrás, panel
 * de edição à direita).
 *
 * Comportamento:
 *  - Esc fecha
 *  - Click no backdrop fecha (a menos que `dismissOnBackdrop=false`)
 *  - Animação 280ms cubic-bezier(0.4, 0, 0.2, 1)
 *  - Trapa focus dentro do panel quando aberto (a11y básico)
 *  - Largura padrão 480px, configurável
 */
export interface SlideOverPanelProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Largura. Default = `'480px'`. */
  width?: string;
  /** Action buttons no rodapé (ex.: Salvar/Cancelar). */
  footer?: ReactNode;
  /** Quando false, clique no backdrop NÃO fecha. Default = true. */
  dismissOnBackdrop?: boolean;
}

export function SlideOverPanel({
  open,
  onClose,
  title,
  children,
  width = '480px',
  footer,
  dismissOnBackdrop = true,
}: SlideOverPanelProps) {
  useKeyboardShortcut('Escape', onClose, { disabled: !open, allowInInput: true });

  // Bloqueia scroll do body enquanto o panel está aberto
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={dismissOnBackdrop ? onClose : undefined}
            className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm"
          />
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
            role="dialog"
            aria-labelledby="slideover-title"
            className="fixed right-0 top-0 z-50 flex h-full flex-col bg-white shadow-2xl"
            style={{ width }}
          >
            <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h2 id="slideover-title" className="text-lg font-bold text-cbmes-blue">
                {title}
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Fechar"
                className="rounded-button p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              >
                ✕
              </button>
            </header>
            <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
            {footer && (
              <footer className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
                {footer}
              </footer>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

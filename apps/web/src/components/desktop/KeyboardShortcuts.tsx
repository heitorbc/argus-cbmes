import { useEffect, type ReactNode } from 'react';

/**
 * S2.10.12b — Hook + provider para atalhos de teclado no modo WEB.
 * Respeita inputs (não dispara se o usuário está digitando num
 * <input>/<textarea>/<contenteditable>).
 *
 * Uso típico:
 *   useKeyboardShortcut('Escape', () => closeModal());
 *   useKeyboardShortcut('n', () => openNewForm()); // letra simples
 *   useKeyboardShortcut('k', () => focusSearch(), { ctrl: true });
 *
 * Para registrar múltiplos atalhos numa página, chame o hook múltiplas
 * vezes — cada um é independente.
 */

export interface ShortcutOptions {
  /** Requer Ctrl (ou ⌘ em Mac) pressionado. Default = false. */
  ctrl?: boolean;
  /** Requer Shift pressionado. Default = false. */
  shift?: boolean;
  /** Requer Alt pressionado. Default = false. */
  alt?: boolean;
  /** Quando true, dispara mesmo quando focus está em input. Default = false. */
  allowInInput?: boolean;
  /** Quando true, hook desativa (útil pra condicionalmente desligar). */
  disabled?: boolean;
}

export function useKeyboardShortcut(
  key: string,
  handler: (e: KeyboardEvent) => void,
  options: ShortcutOptions = {},
) {
  useEffect(() => {
    if (options.disabled) return;

    const listener = (e: KeyboardEvent) => {
      if (e.key !== key) return;
      if (!!options.ctrl !== (e.ctrlKey || e.metaKey)) return;
      if (!!options.shift !== e.shiftKey) return;
      if (!!options.alt !== e.altKey) return;

      if (!options.allowInInput && isEditableElement(document.activeElement)) {
        return;
      }

      e.preventDefault();
      handler(e);
    };

    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [
    key,
    handler,
    options.ctrl,
    options.shift,
    options.alt,
    options.allowInInput,
    options.disabled,
  ]);
}

function isEditableElement(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el instanceof HTMLElement && el.isContentEditable) return true;
  return false;
}

/**
 * Componente provider opcional — em geral basta usar o hook diretamente
 * onde o atalho importa. Este wrapper existe para casos onde queremos
 * registrar vários atalhos globais num único lugar.
 */
export interface KeyboardShortcutsProps {
  shortcuts: Array<{
    key: string;
    handler: () => void;
    options?: ShortcutOptions;
  }>;
  children: ReactNode;
}

export function KeyboardShortcuts({ shortcuts, children }: KeyboardShortcutsProps) {
  return (
    <>
      {shortcuts.map((s, i) => (
        <ShortcutRegister key={i} shortcut={s} />
      ))}
      {children}
    </>
  );
}

function ShortcutRegister({
  shortcut,
}: {
  shortcut: { key: string; handler: () => void; options?: ShortcutOptions };
}) {
  useKeyboardShortcut(shortcut.key, shortcut.handler, shortcut.options);
  return null;
}

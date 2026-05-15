import { useEffect, useState } from 'react';

/**
 * Toast simples — flutua no canto inferior direito por `duration` ms e
 * dispara `onDone` ao desaparecer (consumido pelo caller para reagir).
 *
 * Sem lib externa (projeto não usa sonner/react-hot-toast). Mobile-first:
 * full-width no celular, ancorado bottom-right no desktop.
 */
export function Toast({
  message,
  variant = 'success',
  duration = 1800,
  onDone,
}: {
  message: string;
  variant?: 'success' | 'error' | 'info';
  duration?: number;
  onDone?: () => void;
}) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => {
      setVisible(false);
      onDone?.();
    }, duration);
    return () => clearTimeout(t);
  }, [duration, onDone]);

  if (!visible) return null;

  const colors =
    variant === 'success'
      ? 'border-emerald-400 bg-emerald-50 text-emerald-900'
      : variant === 'error'
        ? 'border-feedback-error/40 bg-feedback-error/10 text-feedback-error'
        : 'border-cbmes-blue/40 bg-cbmes-blue/10 text-cbmes-blue';

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed inset-x-4 bottom-4 z-50 rounded border-2 px-3 py-2 text-sm font-medium shadow-lg sm:inset-x-auto sm:right-4 sm:max-w-sm ${colors}`}
    >
      {message}
    </div>
  );
}

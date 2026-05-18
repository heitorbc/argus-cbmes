import { useEffect, useState } from 'react';

/**
 * S2.10.6 — Contador regressivo até 08:00 do dia atual.
 *
 * Visível na tela do Mapa Força enquanto o MF CIODES ainda não foi
 * preenchido (sinaliza ao Fiscal o prazo institucional). Cor:
 *  - verde   > 30 min restantes
 *  - amarelo entre 10 e 30 min
 *  - vermelho < 10 min ou prazo expirado
 *
 * Atualiza a cada minuto (intervalo barato pra mobile; precisão de
 * segundos é desnecessária pra prazo administrativo).
 */
export function CountdownAteOito() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const target = new Date(now);
  target.setHours(8, 0, 0, 0);
  const diffMs = target.getTime() - now.getTime();
  const expirou = diffMs < 0;
  const absMin = Math.floor(Math.abs(diffMs) / 60_000);
  const horas = Math.floor(absMin / 60);
  const minutos = absMin % 60;
  const txt = horas > 0 ? `${horas}h ${String(minutos).padStart(2, '0')}min` : `${minutos}min`;

  let cor: string;
  let icone: string;
  if (expirou) {
    cor = 'bg-feedback-error/10 border-feedback-error/30 text-feedback-error';
    icone = '⏰';
  } else if (absMin < 10) {
    cor = 'bg-feedback-error/10 border-feedback-error/30 text-feedback-error';
    icone = '🔴';
  } else if (absMin < 30) {
    cor = 'bg-amber-50 border-amber-300 text-amber-800';
    icone = '🟡';
  } else {
    cor = 'bg-emerald-50 border-emerald-300 text-emerald-800';
    icone = '🟢';
  }

  return (
    <div
      role="timer"
      aria-live="polite"
      className={`rounded border px-3 py-2 text-xs font-medium ${cor}`}
    >
      <span aria-hidden className="mr-1.5">
        {icone}
      </span>
      {expirou ? (
        <>
          <strong>Prazo expirado</strong> há {txt} (preencher MF CIODES até 08:00).
        </>
      ) : (
        <>
          <strong>{txt}</strong> até as 08:00 — prazo para o 1º preenchimento do MF CIODES.
        </>
      )}
    </div>
  );
}

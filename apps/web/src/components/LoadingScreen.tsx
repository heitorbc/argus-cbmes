import { useEffect, useState } from 'react';

/**
 * S2.5 — Tela de carregamento animada para suavizar a percepção de
 * cold start do backend (Render free tier hiberna após 15min de inatividade;
 * primeira request pode levar 20-30s para responder).
 *
 * Design:
 *   - Spinner CSS minimalista nas cores institucionais (cbmes-red).
 *   - Mensagens rotativas a cada 2.4s (fade in/out) para dar a sensação
 *     de progresso mesmo enquanto o backend está hibernado.
 *   - Após 8s sem terminar, exibe aviso de "servidor ocioso aquecendo".
 *   - Após 30s, oferece botão de recarregar como fallback.
 *
 * Uso: substitui o `<FullScreenLoader>` antigo no `router.tsx`. Pode ser
 * usada em qualquer outro ponto onde houver espera longa por backend.
 */

const MENSAGENS = [
  'Conectando ao servidor…',
  'Carregando seus dados…',
  'Quase lá…',
  'Sincronizando informações…',
  'Preparando a interface…',
];

const ROTATE_INTERVAL_MS = 2400;
const COLD_START_HINT_MS = 8000;
const STUCK_HINT_MS = 30000;

export function LoadingScreen({
  /** Mensagem inicial antes da primeira rotação. Default: primeira de MENSAGENS. */
  mensagemInicial,
}: {
  mensagemInicial?: string;
} = {}) {
  const [idx, setIdx] = useState(0);
  const [coldStart, setColdStart] = useState(false);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const rotate = setInterval(() => {
      setIdx((i) => (i + 1) % MENSAGENS.length);
    }, ROTATE_INTERVAL_MS);
    const coldTimer = setTimeout(() => setColdStart(true), COLD_START_HINT_MS);
    const stuckTimer = setTimeout(() => setStuck(true), STUCK_HINT_MS);
    return () => {
      clearInterval(rotate);
      clearTimeout(coldTimer);
      clearTimeout(stuckTimer);
    };
  }, []);

  const mensagem = idx === 0 && mensagemInicial ? mensagemInicial : MENSAGENS[idx];

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-screen flex-col items-center justify-center bg-white px-6 py-8"
    >
      <Spinner />

      <p key={mensagem} className="mt-6 animate-pulse text-base font-medium text-cbmes-blue">
        {mensagem}
      </p>

      {coldStart && !stuck && (
        <p className="mt-3 max-w-xs text-center text-xs text-slate-500">
          O servidor estava ocioso e está aquecendo. Pode levar até 30 segundos na primeira chamada.
        </p>
      )}

      {stuck && (
        <div className="mt-4 flex flex-col items-center gap-2">
          <p className="max-w-xs text-center text-xs text-feedback-error">
            Está demorando mais que o esperado. Verifique sua conexão ou tente recarregar.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-button border border-cbmes-blue bg-white px-4 py-2 text-sm font-medium text-cbmes-blue hover:bg-cbmes-blue/5"
          >
            Recarregar
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Spinner CSS puro — sem dependências externas. 3 anéis girando em
 * velocidades distintas para dar profundidade visual sutil.
 */
function Spinner() {
  return (
    <div className="relative h-16 w-16">
      <span className="absolute inset-0 animate-spin rounded-full border-4 border-cbmes-red/20 border-t-cbmes-red" />
      <span
        className="absolute inset-2 animate-spin rounded-full border-4 border-cbmes-blue/20 border-t-cbmes-blue"
        style={{ animationDuration: '1.6s', animationDirection: 'reverse' }}
      />
    </div>
  );
}

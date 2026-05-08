import { useEffect, useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

type HealthStatus = 'desconhecido' | 'ok' | 'erro';

export function App() {
  const [healthStatus, setHealthStatus] = useState<HealthStatus>('desconhecido');

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_URL}/health`)
      .then((res) => (res.ok ? res.json() : Promise.reject(res.statusText)))
      .then(() => {
        if (!cancelled) setHealthStatus('ok');
      })
      .catch(() => {
        if (!cancelled) setHealthStatus('erro');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-white px-6 py-12">
      <div className="w-full max-w-md text-center">
        <h1 className="text-3xl font-bold text-cbmes-red sm:text-4xl">ARGUS CBMES</h1>
        <p className="mt-2 text-lg font-medium text-cbmes-blue">1ª Cia / 1º BBM</p>
        <p className="mt-6 text-base text-slate-600">Em construção</p>

        <div className="mt-10 rounded border border-slate-200 bg-slate-50 p-4 text-sm">
          <p className="font-medium text-slate-700">Backend</p>
          <p className="mt-1 text-slate-500" data-testid="health-status">
            {healthStatus === 'desconhecido' && 'Verificando...'}
            {healthStatus === 'ok' && <span className="text-feedback-success">/health OK</span>}
            {healthStatus === 'erro' && (
              <span className="text-feedback-error">/health indisponível</span>
            )}
          </p>
        </div>

        <p className="mt-12 text-xs text-slate-400">Sprint S0 — Setup e Fundação</p>
      </div>
    </main>
  );
}

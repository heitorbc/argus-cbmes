import { useEffect, useState } from 'react';
import type { HealthEstado, HealthServico, HealthStatus } from '@argus/shared-types';
import { ApiError, api } from '@/lib/api';

/**
 * S2.6 — Barra compacta de status dos serviços externos.
 *
 * Exibida na home logo abaixo do marcador de Sprint. Lê `/health/status`
 * a cada 60s e mostra um indicador colorido por serviço:
 *   🟢 ok  ·  🟡 degraded  ·  🔴 down  ·  ⚪ pending
 *
 * Tooltip (hover) mostra o detalhe e timestamp da última sincronização.
 *
 * O endpoint `/health/status` é `@Public` no backend, então o componente
 * funciona mesmo na tela de login (útil pra confirmar que a API está
 * respondendo durante o cold start do Render).
 */

const POLL_INTERVAL_MS = 60_000;

const SERVICOS_LABEL: Record<keyof Omit<HealthStatus, 'geradoEm'>, string> = {
  api: 'API',
  sheetsDb: 'Sheets-DB',
  mapaForcaCiodes: 'Mapa Força',
  supabase: 'Supabase',
};

export function StatusBar() {
  const [status, setStatus] = useState<HealthStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchStatus = async () => {
      try {
        const s = await api.healthStatus();
        if (!cancelled) {
          setStatus(s);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : 'API indisponível');
        }
      }
    };
    void fetchStatus();
    const id = setInterval(fetchStatus, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (error && !status) {
    return (
      <div className="mt-2 flex items-center gap-2 rounded border border-feedback-error/30 bg-feedback-error/5 px-3 py-1.5 text-xs text-feedback-error">
        <Dot estado="down" />
        <span>API indisponível: {error}</span>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="mt-2 flex items-center gap-2 rounded border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-500">
        <span>Verificando status dos serviços…</span>
      </div>
    );
  }

  const servicos: Array<[keyof typeof SERVICOS_LABEL, HealthServico]> = [
    ['api', status.api],
    ['sheetsDb', status.sheetsDb],
    ['mapaForcaCiodes', status.mapaForcaCiodes],
    ['supabase', status.supabase],
  ];

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600">
      <span className="font-medium uppercase tracking-wide text-slate-500">Status:</span>
      {servicos.map(([key, svc]) => (
        <span key={key} className="flex items-center gap-1" title={tooltipFor(svc)}>
          <Dot estado={svc.estado} />
          <span className="text-slate-700">{SERVICOS_LABEL[key]}</span>
        </span>
      ))}
    </div>
  );
}

function tooltipFor(svc: HealthServico): string {
  const partes: string[] = [estadoLabel(svc.estado)];
  if (svc.detalhe) partes.push(svc.detalhe);
  if (svc.ultimaSyncEm) partes.push(`última sync: ${formatRelativo(svc.ultimaSyncEm)}`);
  return partes.join(' · ');
}

function estadoLabel(e: HealthEstado): string {
  switch (e) {
    case 'ok':
      return 'OK';
    case 'degraded':
      return 'Degradado';
    case 'down':
      return 'Indisponível';
    case 'pending':
      return 'Pendente';
  }
}

function formatRelativo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `há ${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `há ${min}min`;
  const h = Math.floor(min / 60);
  return `há ${h}h`;
}

function Dot({ estado }: { estado: HealthEstado }) {
  const cor =
    estado === 'ok'
      ? 'bg-feedback-success'
      : estado === 'degraded'
        ? 'bg-amber-400'
        : estado === 'down'
          ? 'bg-feedback-error'
          : 'bg-slate-300';
  return <span className={`inline-block h-2 w-2 rounded-full ${cor}`} aria-hidden />;
}

import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { AgendaItem, AgendaResponse } from '@argus/shared-types';
import { ApiError, api } from '@/lib/api';
import { Skeleton } from '@/components/Skeleton';

/**
 * Card compacto exibido na home com a PRÓXIMA escala do militar logado.
 * Mostra também badge de alerta se houver conflitos detectados na janela.
 *
 * S2.10.11a — useQuery + staleTime 5min. Cache hidratado do localStorage
 * (via React Query persister) torna 2ª visita instantânea.
 */
export function AgendaCard() {
  const {
    data,
    isLoading: loading,
    error: queryError,
  } = useQuery<AgendaResponse>({
    queryKey: ['agenda-proxima', 30],
    queryFn: () => api.agendaProxima(30),
    staleTime: 5 * 60 * 1000,
  });

  if (loading) {
    return (
      <div className="rounded border border-cbmes-blue/20 bg-white p-3">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="mt-2 h-3 w-2/3" />
      </div>
    );
  }
  if (queryError) {
    const msg = queryError instanceof ApiError ? queryError.message : 'Erro ao carregar agenda';
    return (
      <div className="rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
        Agenda indisponível: {msg}
      </div>
    );
  }
  if (!data) return null;

  const { proximoItem, conflitos } = data;
  return (
    <div className="rounded border border-cbmes-blue/20 bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-cbmes-blue">📅 Minha próxima escala</h3>
        <Link to="/agenda" className="text-xs text-cbmes-blue hover:underline">
          Ver toda agenda →
        </Link>
      </div>
      {proximoItem ? (
        <AgendaItemRow item={proximoItem} />
      ) : (
        <p className="mt-2 text-xs italic text-slate-500">
          Nenhuma escala encontrada nos próximos 30 dias.
        </p>
      )}
      {conflitos.length > 0 && (
        <div className="mt-2 rounded border border-feedback-error/40 bg-feedback-error/10 px-2 py-1 text-xs text-feedback-error">
          ⚠️ {conflitos.length} possível{conflitos.length > 1 ? 'is' : ''} conflito
          {conflitos.length > 1 ? 's' : ''} de escala —{' '}
          <Link to="/agenda" className="underline">
            ver detalhes
          </Link>
        </div>
      )}
    </div>
  );
}

function AgendaItemRow({ item }: { item: AgendaItem }) {
  return (
    <div className="mt-2 text-sm">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-semibold text-slate-900">{formatDataBR(item.data)}</span>
        <FonteBadge fonte={item.fonte} />
        {item.horarioInicio && (
          <span className="text-xs text-slate-600">
            {item.horarioInicio}
            {item.horarioFim ? `–${item.horarioFim}` : ''}
          </span>
        )}
      </div>
      <div className="mt-0.5 text-slate-800">{item.titulo}</div>
      {item.subtitulo && <div className="text-xs text-slate-500">{item.subtitulo}</div>}
    </div>
  );
}

export function FonteBadge({ fonte }: { fonte: AgendaItem['fonte'] }) {
  const cfg = FONTE_CFG[fonte];
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${cfg.classes}`}>
      {cfg.label}
    </span>
  );
}

export const FONTE_CFG: Record<AgendaItem['fonte'], { label: string; classes: string }> = {
  escala_mensal: { label: 'Mensal', classes: 'bg-cbmes-blue/15 text-cbmes-blue' },
  escala_especial: { label: 'Especial', classes: 'bg-purple-100 text-purple-800' },
  nota_servico: { label: 'NS', classes: 'bg-green-100 text-green-800' },
  iseo_hospitais: { label: 'ISEO', classes: 'bg-amber-100 text-amber-800' },
  chefe_operacoes: { label: 'ChOp', classes: 'bg-rose-100 text-rose-800' },
  atestado: { label: 'Atestado', classes: 'bg-slate-200 text-slate-700' },
  dispensa: { label: 'Dispensa', classes: 'bg-slate-200 text-slate-700' },
  ferias: { label: 'Férias', classes: 'bg-sky-100 text-sky-800' },
  troca_autorizada: { label: 'Troca', classes: 'bg-orange-100 text-orange-800' },
};

function formatDataBR(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

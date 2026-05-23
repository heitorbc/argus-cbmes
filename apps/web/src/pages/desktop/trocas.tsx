import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import type { TrocaAutorizada } from '@argus/shared-types';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { DataTable, type ColumnDef } from '@/components/desktop/DataTable';
import { FilterSidebar, FilterGroup } from '@/components/desktop/FilterSidebar';

/**
 * S2.10.12e — Trocas Autorizadas WEB.
 *
 * Read-only (origem é planilha externa). Foco:
 *   - FilterSidebar: range de data + checkbox "apenas futuras"
 *   - DataTable larga com 8 cols + sort + chip de status colorido
 *   - Inline expand: click linha mostra detalhe abaixo (sem modal)
 *   - Botão "🔄 Sincronizar" reaproveita endpoint de integração
 *
 * Não tem CRUD (planilha externa é a fonte). Botão de sync é admin.
 */
export function DesktopTrocasPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = user?.papeis.includes('admin') ?? false;

  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  const [filtroDataInicio, setFiltroDataInicio] = useState<string>(today);
  const [filtroDataFim, setFiltroDataFim] = useState<string>('');
  const [apenasFuturas, setApenasFuturas] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const {
    data: trocas = [],
    isLoading: loading,
    error: queryError,
  } = useQuery({
    queryKey: ['trocas-autorizadas-list'],
    queryFn: () => api.trocasAutorizadasList(),
    staleTime: 5 * 60 * 1000,
  });
  const error = queryError
    ? queryError instanceof ApiError
      ? queryError.message
      : 'Erro ao carregar trocas'
    : null;

  const filtradas = useMemo(() => {
    return trocas.filter((t) => {
      if (apenasFuturas && t.dataEscala < today && t.dataPagamento < today) return false;
      if (filtroDataInicio && t.dataEscala < filtroDataInicio) return false;
      if (filtroDataFim && t.dataEscala > filtroDataFim) return false;
      return true;
    });
  }, [trocas, apenasFuturas, filtroDataInicio, filtroDataFim, today]);

  const activeFilters =
    (filtroDataInicio !== today ? 1 : 0) + (filtroDataFim ? 1 : 0) + (apenasFuturas ? 0 : 1);

  const clearFilters = () => {
    setFiltroDataInicio(today);
    setFiltroDataFim('');
    setApenasFuturas(true);
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncMsg(null);
    try {
      await api.integracoesSync('trocas-autorizadas');
      await queryClient.invalidateQueries({ queryKey: ['trocas-autorizadas-list'] });
      setSyncMsg('Trocas sincronizadas com sucesso.');
    } catch (e) {
      setSyncMsg(e instanceof ApiError ? e.message : 'Erro no sync');
    } finally {
      setSyncing(false);
    }
  };

  const toggleRow = (t: TrocaAutorizada) => {
    const id = rowKey(t);
    setExpandedId((cur) => (cur === id ? null : id));
  };

  const columns: ColumnDef<TrocaAutorizada>[] = [
    {
      key: 'status',
      label: 'Status',
      width: '110px',
      render: (t) => <StatusChip status={t.statusTroca} />,
      sortValue: (t) => t.statusTroca ?? 'ZZ',
    },
    {
      key: 'dataEscala',
      label: 'Data escala',
      width: '120px',
      render: (t) => formatBR(t.dataEscala),
      sortValue: (t) => t.dataEscala,
    },
    {
      key: 'escaladoOriginal',
      label: 'Escalado',
      render: (t) => <span className="text-slate-800">{t.escaladoOriginal}</span>,
      sortValue: (t) => t.escaladoOriginal,
    },
    {
      key: 'substituto',
      label: 'Substituto',
      render: (t) => <span className="font-medium text-cbmes-blue">{t.substituto}</span>,
      sortValue: (t) => t.substituto,
    },
    {
      key: 'funcao',
      label: 'Função',
      width: '120px',
      render: (t) => <span className="text-xs text-slate-600">{t.funcao}</span>,
    },
    {
      key: 'horario',
      label: 'Horário',
      width: '90px',
      render: (t) => <code className="text-xs">{t.horario}</code>,
    },
    {
      key: 'dataPagamento',
      label: 'Pagamento',
      width: '120px',
      render: (t) => formatBR(t.dataPagamento),
      sortValue: (t) => t.dataPagamento,
    },
    {
      key: 'dobra',
      label: 'Dobra',
      width: '70px',
      align: 'center',
      render: (t) => (t.isDobra48h ? '⚠️' : '—'),
    },
  ];

  return (
    <div className="flex h-full">
      <FilterSidebar
        title="Filtros"
        activeCount={activeFilters > 0 ? activeFilters : 0}
        onClear={clearFilters}
      >
        <FilterGroup label="Período">
          <label className="block">
            <span className="mb-1 block text-[10px] uppercase text-slate-500">De</span>
            <input
              type="date"
              value={filtroDataInicio}
              onChange={(e) => setFiltroDataInicio(e.target.value)}
              className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
            />
          </label>
          <label className="mt-2 block">
            <span className="mb-1 block text-[10px] uppercase text-slate-500">Até</span>
            <input
              type="date"
              value={filtroDataFim}
              onChange={(e) => setFiltroDataFim(e.target.value)}
              className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
            />
          </label>
        </FilterGroup>
        <FilterGroup label="Status">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={apenasFuturas}
              onChange={(e) => setApenasFuturas(e.target.checked)}
              className="h-4 w-4 accent-cbmes-blue"
            />
            <span>Apenas futuras</span>
          </label>
        </FilterGroup>
      </FilterSidebar>

      <main className="flex flex-1 flex-col overflow-hidden">
        <header className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-6 py-3">
          <div>
            <h1 className="text-xl font-bold text-cbmes-blue">🔄 Trocas Autorizadas</h1>
            <p className="text-xs text-slate-500">
              {filtradas.length} {filtradas.length === 1 ? 'troca' : 'trocas'} · planilha externa
              read-only
            </p>
          </div>
          {isAdmin && (
            <button
              type="button"
              onClick={() => void handleSync()}
              disabled={syncing}
              className="rounded-button border border-cbmes-blue bg-white px-3 py-2 text-sm font-medium text-cbmes-blue hover:bg-cbmes-blue/5 disabled:opacity-50"
            >
              {syncing ? '⟳ Sincronizando…' : '🔄 Sincronizar'}
            </button>
          )}
        </header>

        {syncMsg && (
          <div className="border-b border-slate-200 bg-slate-50 px-6 py-2 text-xs text-slate-700">
            {syncMsg}
          </div>
        )}
        {error && (
          <div className="border-b border-feedback-error/30 bg-feedback-error/10 px-6 py-3 text-sm text-feedback-error">
            {error}
          </div>
        )}

        <div className="flex-1 overflow-auto p-6">
          <DataTable
            columns={columns}
            data={filtradas}
            rowKey={rowKey}
            loading={loading}
            onRowClick={toggleRow}
            highlightRow={(t) => rowKey(t) === expandedId}
            emptyState="Nenhuma troca no período."
          />

          <AnimatePresence>
            {expandedId &&
              filtradas
                .filter((t) => rowKey(t) === expandedId)
                .map((t) => (
                  <motion.div
                    key={expandedId}
                    initial={{ opacity: 0, y: -10, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: 'auto' }}
                    exit={{ opacity: 0, y: -10, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="mt-4 overflow-hidden rounded-lg border border-cbmes-blue/30 bg-white"
                  >
                    <DetalheTroca troca={t} />
                  </motion.div>
                ))}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────

function StatusChip({ status }: { status?: 'VERIFICADO' | 'PENDENTE' }) {
  if (status === 'VERIFICADO') {
    return (
      <span className="inline-block rounded-full bg-feedback-success/15 px-2 py-0.5 text-xs font-semibold text-feedback-success">
        ✓ Verificado
      </span>
    );
  }
  if (status === 'PENDENTE') {
    return (
      <span className="inline-block rounded-full bg-feedback-warn/15 px-2 py-0.5 text-xs font-semibold text-feedback-warn">
        ⏳ Pendente
      </span>
    );
  }
  return <span className="text-xs text-slate-400">—</span>;
}

function DetalheTroca({ troca }: { troca: TrocaAutorizada }) {
  return (
    <div className="grid grid-cols-1 gap-0 divide-y divide-slate-200 md:grid-cols-2 md:divide-x md:divide-y-0">
      <Lado titulo="🎯 Assume serviço (lado 1)" data={troca.dataEscala}>
        <Field label="Escalado original" value={troca.escaladoOriginal} />
        <Field label="Substituto (assume)" value={troca.substituto} valueAccent />
        <Field label="Função" value={troca.funcao} />
        <Field label="Horário" value={troca.horario} mono />
        {troca.escaladoOriginalNf && (
          <Field label="NF escalado" value={troca.escaladoOriginalNf} mono />
        )}
        {troca.substitutoNf && <Field label="NF substituto" value={troca.substitutoNf} mono />}
      </Lado>
      <Lado titulo="💰 Paga troca (lado 2)" data={troca.dataPagamento}>
        <Field label="Escalado pagamento" value={troca.escaladoPagamento} />
        <Field label="Substituto pagamento" value={troca.substitutoPagamento} valueAccent />
        <Field label="Função" value={troca.funcaoPagamento} />
        <Field label="Horário" value={troca.horarioPagamento} mono />
      </Lado>
      {(troca.numeroEdocs || troca.numeroRegistro || troca.isDobra48h) && (
        <div className="col-span-full bg-slate-50 px-5 py-3 text-xs">
          {troca.isDobra48h && (
            <span className="mr-3 inline-block rounded bg-feedback-warn/15 px-2 py-0.5 font-semibold text-feedback-warn">
              ⚠️ Dobra 48h
            </span>
          )}
          {troca.numeroEdocs && (
            <span className="mr-3 text-slate-600">
              e-Docs: <code className="font-mono">{troca.numeroEdocs}</code>
            </span>
          )}
          {troca.numeroRegistro && (
            <span className="text-slate-600">
              Registro: <code className="font-mono">{troca.numeroRegistro}</code>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function Lado({
  titulo,
  data,
  children,
}: {
  titulo: string;
  data: string;
  children: React.ReactNode;
}) {
  return (
    <div className="p-5">
      <h3 className="mb-3 flex items-baseline justify-between text-sm font-bold text-cbmes-blue">
        <span>{titulo}</span>
        <span className="text-xs text-slate-500">{formatBR(data)}</span>
      </h3>
      <dl className="space-y-2">{children}</dl>
    </div>
  );
}

function Field({
  label,
  value,
  valueAccent,
  mono,
}: {
  label: string;
  value: string;
  valueAccent?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd
        className={`text-right text-sm ${valueAccent ? 'font-semibold text-cbmes-blue' : 'text-slate-800'} ${mono ? 'font-mono' : ''}`}
      >
        {value || '—'}
      </dd>
    </div>
  );
}

function formatBR(iso: string): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function rowKey(t: TrocaAutorizada): string {
  return `${t.dataEscala}|${t.substituto}|${t.funcao}|${t.dataPagamento}`;
}

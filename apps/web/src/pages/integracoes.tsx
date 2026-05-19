import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  STATUS_INTEGRACAO_LABEL,
  type IntegracaoStatus,
  type SyncLogEntry,
} from '@argus/shared-types';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

const REFRESH_MS = 30_000;

/**
 * S0.5/PR2 + S2.10.8a — Página de Configurações: lista as planilhas Google
 * Sheets consumidas pelo backend. S2.10.8a adicionou:
 * - 13 sources (vs 8 antes) — inclui ISEO Hospitais, QDI, MF CIODES, Sheets-DB
 * - Badge "⚡ Tempo-real" para sources sem persistência (real-time only)
 * - Botão "Sincronizar todas" (admin) → dispara orchestrator
 * - Histórico de syncs (últimos 20) por source via modal
 *
 * Auto-refresh a cada 30s para refletir mudanças no cache do backend
 * sem o usuário ter que recarregar a página.
 */
export function IntegracoesPage() {
  const { user } = useAuth();
  const isAdmin = user?.papeis.includes('admin') ?? false;
  const [items, setItems] = useState<IntegracaoStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncAllResult, setSyncAllResult] = useState<string | null>(null);
  const [historicoModal, setHistoricoModal] = useState<{ id: string; nome: string } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const list = await api.integracoesList();
        if (cancelled) return;
        setItems(list);
        setError(null);
        setAtualizadoEm(new Date());
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : 'Erro ao carregar integrações');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  async function handleSync(id: string) {
    setSyncingId(id);
    setSyncError(null);
    try {
      const updated = await api.integracoesSync(id);
      setItems((prev) => prev.map((it) => (it.id === id ? updated : it)));
      setAtualizadoEm(new Date());
    } catch (e) {
      setSyncError(e instanceof ApiError ? e.message : 'Erro ao sincronizar');
    } finally {
      setSyncingId(null);
    }
  }

  async function handleSyncAll() {
    if (!confirm('Sincronizar TODAS as integrações persistidas? Pode demorar 30-60s.')) return;
    setSyncingAll(true);
    setSyncAllResult(null);
    setSyncError(null);
    try {
      const logs = await api.integracoesSyncAll();
      const ok = logs.filter((l) => l.status === 'success').length;
      const partial = logs.filter((l) => l.status === 'partial').length;
      const failed = logs.filter((l) => l.status === 'failed').length;
      setSyncAllResult(
        `✓ Sync completo — ${ok} OK${partial > 0 ? `, ${partial} parcial(is)` : ''}${failed > 0 ? `, ${failed} falha(s)` : ''}`,
      );
      // Recarrega lista pra refletir novos timestamps
      const list = await api.integracoesList();
      setItems(list);
      setAtualizadoEm(new Date());
    } catch (e) {
      setSyncError(e instanceof ApiError ? e.message : 'Erro ao sincronizar tudo');
    } finally {
      setSyncingAll(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-cbmes-blue px-4 py-4 text-white">
        <Link to="/" className="text-sm opacity-90 hover:opacity-100">
          ← Home
        </Link>
        <h1 className="mt-1 text-lg font-bold">🔗 Integrações</h1>
        <p className="text-xs opacity-90">
          Planilhas Google Sheets consumidas pelo backend · sync periódico 00/06/12/18h
        </p>
      </header>

      <section className="mx-auto max-w-5xl p-4">
        <div className="rounded border border-slate-200 bg-white p-3 text-xs text-slate-600">
          Sources marcadas <Badge text="⚡ Tempo-real" className="bg-amber-100 text-amber-800" />{' '}
          lêem direto da planilha (cache 5min, sem persistência). As demais são sincronizadas pelo
          scheduler central (startup + 00h/06h/12h/18h + auto). Atualiza a cada 30s.
          {atualizadoEm && (
            <span className="ml-2 text-slate-400">
              · última atualização: {atualizadoEm.toLocaleTimeString('pt-BR')}
            </span>
          )}
        </div>

        {isAdmin && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleSyncAll()}
              disabled={syncingAll}
              className="rounded-button bg-cbmes-red px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {syncingAll ? '⟳ Sincronizando todas…' : '🔄 Sincronizar todas (orchestrator)'}
            </button>
            {syncAllResult && (
              <span className="rounded border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700">
                {syncAllResult}
              </span>
            )}
          </div>
        )}

        {error && (
          <div className="mt-3 rounded border border-feedback-error/30 bg-feedback-error/10 p-3 text-sm text-feedback-error">
            {error}
          </div>
        )}

        {syncError && (
          <div className="mt-3 rounded border border-feedback-error/30 bg-feedback-error/10 p-3 text-sm text-feedback-error">
            {syncError}
          </div>
        )}

        {loading && items.length === 0 && (
          <p className="mt-4 text-sm text-slate-500">Carregando…</p>
        )}

        {items.length > 0 && (
          <div className="mt-4 overflow-x-auto rounded border border-slate-200 bg-white">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-100">
                <tr className="text-left">
                  <th className="px-3 py-2">Nome</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Modo</th>
                  <th className="px-3 py-2">Último sync</th>
                  <th className="px-3 py-2 text-right">Registros</th>
                  <th className="px-3 py-2">Fonte</th>
                  <th className="px-3 py-2">Histórico</th>
                  {isAdmin && <th className="px-3 py-2">Ações</th>}
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} className="border-t border-slate-200 align-top">
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-800">{it.nome}</div>
                      <div className="mt-0.5 text-[11px] text-slate-500">{it.descricao}</div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <StatusBadge status={it.status} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {it.realtimeOnly ? (
                        <Badge text="⚡ Tempo-real" className="bg-amber-100 text-amber-800" />
                      ) : (
                        <Badge text="💾 Persistido" className="bg-emerald-100 text-emerald-800" />
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {it.ultimoSyncEm ? formatDataHora(it.ultimoSyncEm) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{it.qtdRegistros}</td>
                    <td className="px-3 py-2">
                      {it.url ? (
                        <a
                          href={it.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="text-cbmes-blue underline-offset-2 hover:underline"
                        >
                          Abrir ↗
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => setHistoricoModal({ id: it.id, nome: it.nome })}
                        className="text-cbmes-blue underline-offset-2 hover:underline"
                      >
                        Ver
                      </button>
                    </td>
                    {isAdmin && (
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => void handleSync(it.id)}
                          disabled={syncingId !== null}
                          className="rounded-button border border-cbmes-blue px-2 py-1 text-[11px] font-medium text-cbmes-blue transition hover:bg-cbmes-blue/10 disabled:opacity-50"
                        >
                          {syncingId === it.id ? 'Sincronizando…' : '🔄 Sincronizar'}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {historicoModal && (
        <HistoricoModal
          fonte={historicoModal.id}
          nome={historicoModal.nome}
          onClose={() => setHistoricoModal(null)}
        />
      )}
    </main>
  );
}

function HistoricoModal({
  fonte,
  nome,
  onClose,
}: {
  fonte: string;
  nome: string;
  onClose: () => void;
}) {
  const [logs, setLogs] = useState<SyncLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .integracoesHistorico(fonte)
      .then((data) => {
        if (!cancelled) {
          setLogs(data);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : 'Erro ao carregar histórico');
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [fonte]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-2xl rounded border border-slate-200 bg-white p-4 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-cbmes-blue">📜 Histórico — {nome}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-300 px-3 py-1 text-xs text-slate-700"
          >
            Fechar
          </button>
        </div>
        {loading && <p className="mt-3 text-sm text-slate-500">Carregando histórico…</p>}
        {error && (
          <p className="mt-3 rounded border border-feedback-error/30 bg-feedback-error/10 p-2 text-xs text-feedback-error">
            {error}
          </p>
        )}
        {!loading && !error && logs.length === 0 && (
          <p className="mt-3 text-sm text-slate-500">Nenhum sync registrado para esta fonte.</p>
        )}
        {logs.length > 0 && (
          <div className="mt-3 max-h-96 overflow-y-auto">
            <table className="min-w-full text-xs">
              <thead className="sticky top-0 bg-slate-100">
                <tr className="text-left">
                  <th className="px-2 py-1">Quando</th>
                  <th className="px-2 py-1">Trigger</th>
                  <th className="px-2 py-1">Status</th>
                  <th className="px-2 py-1 text-right">Cri/Atu/Pul</th>
                  <th className="px-2 py-1 text-right">Duração</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} className="border-t border-slate-200">
                    <td className="px-2 py-1">
                      {new Date(l.finalizadoEm).toLocaleString('pt-BR')}
                    </td>
                    <td className="px-2 py-1">{l.trigger}</td>
                    <td className="px-2 py-1">
                      <StatusSyncLogBadge status={l.status} />
                    </td>
                    <td className="px-2 py-1 text-right font-mono">
                      {l.created}/{l.updated}/{l.skipped}
                    </td>
                    <td className="px-2 py-1 text-right font-mono">{l.duracaoMs}ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: IntegracaoStatus['status'] }) {
  const styles: Record<IntegracaoStatus['status'], string> = {
    ok: 'bg-emerald-100 text-emerald-800',
    stale: 'bg-amber-100 text-amber-800',
    erro: 'bg-feedback-error/20 text-feedback-error',
    nunca: 'bg-slate-100 text-slate-600',
  };
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${styles[status]}`}
    >
      {STATUS_INTEGRACAO_LABEL[status]}
    </span>
  );
}

function StatusSyncLogBadge({ status }: { status: SyncLogEntry['status'] }) {
  const styles: Record<SyncLogEntry['status'], string> = {
    success: 'bg-emerald-100 text-emerald-800',
    partial: 'bg-amber-100 text-amber-800',
    failed: 'bg-rose-100 text-rose-800',
  };
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${styles[status]}`}
    >
      {status}
    </span>
  );
}

function Badge({ text, className }: { text: string; className: string }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${className}`}>
      {text}
    </span>
  );
}

function formatDataHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR');
}

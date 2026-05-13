import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { STATUS_INTEGRACAO_LABEL, type IntegracaoStatus } from '@argus/shared-types';
import { ApiError, api } from '@/lib/api';

const REFRESH_MS = 30_000;

/**
 * S0.5/PR2 — Página de Configurações: lista (read-only) as planilhas
 * Google Sheets consumidas pelo backend para importação de dados, com
 * status do último sync e qtd de registros.
 *
 * Auto-refresh a cada 30s para refletir mudanças no cache do backend
 * sem o usuário ter que recarregar a página.
 */
export function IntegracoesPage() {
  const [items, setItems] = useState<IntegracaoStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);

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

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-cbmes-blue px-4 py-4 text-white">
        <Link to="/" className="text-sm opacity-90 hover:opacity-100">
          ← Home
        </Link>
        <h1 className="mt-1 text-lg font-bold">🔗 Integrações</h1>
        <p className="text-xs opacity-90">
          Planilhas Google Sheets consumidas pelo backend · read-only
        </p>
      </header>

      <section className="mx-auto max-w-5xl p-4">
        <div className="rounded border border-slate-200 bg-white p-3 text-xs text-slate-600">
          Lista todas as planilhas externas das quais o backend importa dados (cache TTL 5min).
          Atualiza a cada 30 segundos. Clique no link de cada planilha para abrir a fonte no Google
          Drive.
          {atualizadoEm && (
            <span className="ml-2 text-slate-400">
              · última atualização local: {atualizadoEm.toLocaleTimeString('pt-BR')}
            </span>
          )}
        </div>

        {error && (
          <div className="mt-3 rounded border border-feedback-error/30 bg-feedback-error/10 p-3 text-sm text-feedback-error">
            {error}
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
                  <th className="px-3 py-2">Último sync</th>
                  <th className="px-3 py-2 text-right">Registros</th>
                  <th className="px-3 py-2">Fonte</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} className="border-t border-slate-200 align-top">
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-800">{it.nome}</div>
                      <div className="mt-0.5 text-[11px] text-slate-500">{it.descricao}</div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <StatusBadge status={it.status} />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {it.ultimoSyncEm ? formatDataHora(it.ultimoSyncEm) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{it.qtdRegistros}</td>
                    <td className="px-3 py-2">
                      <a
                        href={it.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-cbmes-blue underline-offset-2 hover:underline"
                      >
                        Abrir ↗
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
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

function formatDataHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR');
}

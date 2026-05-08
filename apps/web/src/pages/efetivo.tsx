import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  formatDisplayName,
  SUB_SECAO_LABEL,
  type EfetivoListResponse,
  type Militar,
  type SubSecao,
} from '@argus/shared-types';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;
const ONLY_CIA_KEY = 'argus.efetivo.somente1aCia';

export function EfetivoPage() {
  const { user } = useAuth();
  const [data, setData] = useState<EfetivoListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [somente1aCia, setSomente1aCia] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem(ONLY_CIA_KEY);
      return v === null ? true : v === '1';
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(ONLY_CIA_KEY, somente1aCia ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [somente1aCia]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, somente1aCia]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .efetivoList({
        q: debouncedSearch || undefined,
        page,
        pageSize: PAGE_SIZE,
        somente1aCia,
      })
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof ApiError ? e.message : 'Erro ao carregar efetivo');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, page, somente1aCia]);

  const isAdmin = useMemo(() => user?.papeis.includes('admin') ?? false, [user]);

  const handleForceSync = async () => {
    setLoading(true);
    try {
      const res = await api.efetivoForceSync();
      setData(res);
      setPage(1);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erro ao sincronizar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-cbmes-red px-4 py-4 text-white">
        <div className="flex items-center gap-3">
          <Link to="/" className="text-sm opacity-90 hover:opacity-100">
            ← Início
          </Link>
        </div>
        <h1 className="mt-1 text-lg font-bold">Efetivo</h1>
        <p className="text-xs opacity-90">Cadastros Mestre · QDI + Efetivo (Sargenteante)</p>
      </header>

      <section className="mx-auto max-w-3xl p-4">
        <div className="rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          <strong>
            Cadastro mantido nas planilhas do Sargenteante (Efetivo) e do QDI (1º BBM).
          </strong>{' '}
          O ARGUS lê e exibe; para alterações, contate o 1º SGT De Mattos.
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input
            type="search"
            inputMode="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por NF, nome, nome de guerra ou posto..."
            aria-label="Buscar militar"
            className="flex-1 rounded border border-slate-300 px-3 py-3 text-base focus:border-cbmes-blue focus:outline-none focus:ring-2 focus:ring-cbmes-blue/30"
          />
          {isAdmin && (
            <button
              type="button"
              onClick={handleForceSync}
              disabled={loading}
              className="rounded-button border border-cbmes-blue px-4 py-3 text-sm font-medium text-cbmes-blue transition hover:bg-cbmes-blue/10 disabled:opacity-60"
            >
              Sincronizar agora
            </button>
          )}
        </div>

        <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={somente1aCia}
            onChange={(e) => setSomente1aCia(e.target.checked)}
            className="h-5 w-5 rounded border-slate-300 text-cbmes-red focus:ring-cbmes-red"
          />
          <span>
            Apenas 1ª Cia / 1º BBM{' '}
            <span className="text-xs text-slate-500">(staff, SOS, Guarda, Aquáticas)</span>
          </span>
        </label>

        {data?.stale && (
          <p className="mt-3 text-xs text-feedback-warn">
            ⚠️ Mostrando último snapshot. Uma das planilhas está temporariamente indisponível.
          </p>
        )}
        {data?.syncedAt && (
          <p className="mt-1 text-xs text-slate-500">
            Última sincronização: {new Date(data.syncedAt).toLocaleString('pt-BR')}
          </p>
        )}

        {error && (
          <div
            role="alert"
            className="mt-4 rounded border border-feedback-error/30 bg-feedback-error/10 p-3 text-sm text-feedback-error"
          >
            {error}
          </div>
        )}

        {loading && !data && (
          <p className="mt-6 text-center text-sm text-slate-500">Carregando efetivo…</p>
        )}

        {data && (
          <>
            <p className="mt-4 text-xs text-slate-600">
              {data.total} militar{data.total === 1 ? '' : 'es'} · ordenado por ANT crescente
            </p>

            <ul className="mt-2 divide-y divide-slate-200 rounded border border-slate-200 bg-white">
              {data.items.length === 0 && (
                <li className="p-4 text-center text-sm text-slate-500">
                  Nenhum militar encontrado.
                </li>
              )}
              {data.items.map((m) => (
                <MilitarRow key={m.nf} m={m} />
              ))}
            </ul>

            {data.totalPages > 1 && (
              <nav className="mt-4 flex items-center justify-between text-sm">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1 || loading}
                  className="rounded-button border border-slate-300 bg-white px-3 py-2 text-slate-700 disabled:opacity-50"
                >
                  ← Anterior
                </button>
                <span className="text-slate-600">
                  Página {data.page} de {data.totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                  disabled={page >= data.totalPages || loading}
                  className="rounded-button border border-slate-300 bg-white px-3 py-2 text-slate-700 disabled:opacity-50"
                >
                  Próxima →
                </button>
              </nav>
            )}
          </>
        )}
      </section>
    </main>
  );
}

function MilitarRow({ m }: { m: Militar }) {
  return (
    <li className="p-3 text-sm">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-medium text-cbmes-blue">{formatDisplayName(m)}</span>
        <span className="shrink-0 text-xs text-slate-500">ANT {m.ant}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span>NF: {m.nf}</span>
        {m.subSecao && <SubSecaoBadge subSecao={m.subSecao} />}
        {m.funcao && <span className="italic">{m.funcao}</span>}
        {m.situacao && m.situacao !== 'APTO' && (
          <span className="rounded bg-feedback-warn/15 px-2 py-0.5 text-[10px] font-medium text-feedback-warn">
            {m.situacao}
          </span>
        )}
      </div>
      {(m.idade !== undefined || m.servico !== undefined || m.municipio || m.nomeGuerra) && (
        <div className="mt-1 text-xs text-slate-400">
          {m.nomeGuerra && m.nome !== m.nomeGuerra && <>Nome completo: {m.nome}</>}
          {m.idade !== undefined && <> · {m.idade} anos</>}
          {m.servico !== undefined && <> · {m.servico} anos de serviço</>}
          {m.municipio && <> · {m.municipio}</>}
        </div>
      )}
    </li>
  );
}

const SUB_SECAO_COLORS: Record<SubSecao, string> = {
  staff: 'bg-cbmes-blue/15 text-cbmes-blue',
  sos: 'bg-cbmes-red/15 text-cbmes-red',
  guarda: 'bg-feedback-success/15 text-feedback-success',
  aquaticas: 'bg-sky-200 text-sky-900',
};

function SubSecaoBadge({ subSecao }: { subSecao: SubSecao }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${SUB_SECAO_COLORS[subSecao]}`}
    >
      {SUB_SECAO_LABEL[subSecao]}
    </span>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  formatDisplayName,
  SUB_SECAO_LABEL,
  type EfetivoListResponse,
  type Militar,
  type SubSecao,
} from '@argus/shared-types';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { SkeletonTable } from '@/components/Skeleton';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;
const UNIDADE_KEY = 'argus.efetivo.unidade';
const TODAS = '__TODAS__';

export function EfetivoPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);

  // S2.10.13b — Busca unidade do user logado (via /efetivo/:nf) para usar
  // como default no select. Cache 30min — unidade muda muito raramente.
  const { data: meuMilitar } = useQuery({
    queryKey: ['efetivo-me', user?.nf ?? ''],
    queryFn: () => (user?.nf ? api.efetivoFindByNf(user.nf) : Promise.resolve(null)),
    enabled: !!user?.nf,
    staleTime: 30 * 60 * 1000,
    retry: false,
  });

  // Default: persistência localStorage > unidade do user logado > '__TODAS__'.
  const [unidade, setUnidade] = useState<string>(() => {
    try {
      return localStorage.getItem(UNIDADE_KEY) ?? '';
    } catch {
      return '';
    }
  });

  // Após buscar `meuMilitar`, se não havia escolha salva, define a unidade
  // do user como default.
  useEffect(() => {
    if (!unidade && meuMilitar?.unidade) {
      setUnidade(meuMilitar.unidade);
    } else if (!unidade && meuMilitar && !meuMilitar.unidade) {
      // User sem unidade definida → mostra todas
      setUnidade(TODAS);
    }
  }, [meuMilitar, unidade]);

  useEffect(() => {
    if (unidade) {
      try {
        localStorage.setItem(UNIDADE_KEY, unidade);
      } catch {
        /* ignore */
      }
    }
  }, [unidade]);

  // Lista de unidades disponíveis (DISTINCT no backend).
  const { data: unidadesResp } = useQuery({
    queryKey: ['efetivo-unidades'],
    queryFn: () => api.efetivoUnidades(),
    staleTime: 30 * 60 * 1000,
  });

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, unidade]);

  // S2.10.9c — useQuery substitui useEffect+fetch; staleTime 10min reflete
  // que efetivo muda raramente (após cron 00/06/12/18h ou refetch manual).
  const {
    data,
    isLoading: loading,
    error: queryError,
  } = useQuery<EfetivoListResponse>({
    queryKey: ['efetivo', debouncedSearch || '', page, unidade],
    queryFn: () =>
      api.efetivoList({
        q: debouncedSearch || undefined,
        page,
        pageSize: PAGE_SIZE,
        unidade: unidade && unidade !== TODAS ? unidade : undefined,
      }),
    staleTime: 10 * 60 * 1000,
    enabled: !!unidade, // só busca após resolver o default
  });
  const error = queryError
    ? queryError instanceof ApiError
      ? queryError.message
      : 'Erro ao carregar efetivo'
    : null;

  const isAdmin = useMemo(() => user?.papeis.includes('admin') ?? false, [user]);

  const handleForceSync = async () => {
    try {
      const res = await api.efetivoForceSync();
      // Atualiza apenas a query corrente; outras pages se necessário ficam stale.
      queryClient.setQueryData<EfetivoListResponse>(
        ['efetivo', debouncedSearch || '', page, unidade],
        res,
      );
      // Invalida demais combinações de filtro para refletir na próxima nav.
      await queryClient.invalidateQueries({ queryKey: ['efetivo'] });
      await queryClient.invalidateQueries({ queryKey: ['efetivo-unidades'] });
      setPage(1);
    } catch {
      /* erros aparecem na próxima refetch */
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

        {/* S2.10.13b — Select multi-unidade (substitui checkbox 1ª Cia). */}
        <label className="mt-3 flex flex-col gap-1 text-sm text-slate-700 sm:flex-row sm:items-center sm:gap-3">
          <span className="font-medium text-slate-600">Unidade:</span>
          <select
            value={unidade || ''}
            onChange={(e) => setUnidade(e.target.value)}
            className="rounded border border-slate-300 px-3 py-2 text-sm focus:border-cbmes-blue focus:outline-none focus:ring-2 focus:ring-cbmes-blue/30"
          >
            <option value={TODAS}>Todas as unidades</option>
            {(unidadesResp?.unidades ?? []).map((u) => (
              <option key={u} value={u}>
                {u}
                {meuMilitar?.unidade === u ? ' (minha unidade)' : ''}
              </option>
            ))}
          </select>
          {meuMilitar?.unidade && unidade === meuMilitar.unidade && (
            <span className="text-xs text-slate-500">
              Default da sua lotação ({meuMilitar.unidade})
            </span>
          )}
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

        {loading && !data && <SkeletonTable rows={10} cols={5} className="mt-6" />}

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
    <li className="text-sm">
      <Link to={`/cadastros/efetivo/${m.nf}`} className="block p-3 transition hover:bg-slate-50">
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-medium text-cbmes-blue">{formatDisplayName(m)}</span>
          <span className="shrink-0 text-xs text-slate-500">ANT {m.ant}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span>NF: {m.nf}</span>
          {m.subSecao && <SubSecaoBadge subSecao={m.subSecao} />}
          {m.papelEspecial && (
            <span className="rounded bg-cbmes-blue/15 px-2 py-0.5 text-[10px] font-semibold text-cbmes-blue">
              {m.papelEspecial}
            </span>
          )}
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
      </Link>
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

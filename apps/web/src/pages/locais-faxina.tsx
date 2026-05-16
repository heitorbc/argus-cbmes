import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { LocalFaxina } from '@argus/shared-types';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

/**
 * S0.x/parte-diaria — CRUD admin dos Locais de Faxina.
 *
 * Os locais alimentam o select de Faxina na Parte Diária. Bootstrap dev
 * cria 9 defaults (RECOLHIMENTO DO LIXO, ALOJ. MASC. ST/SGT, etc.).
 */
export function LocaisFaxinaPage() {
  const { user } = useAuth();
  const isAdmin = user?.papeis.includes('admin') ?? false;

  const [items, setItems] = useState<LocalFaxina[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [novoNome, setNovoNome] = useState('');
  const [salvando, setSalvando] = useState(false);

  const carregar = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.locaisFaxinaList();
      setItems(r);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erro ao carregar locais');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void carregar();
  }, []);

  const criar = async () => {
    if (!novoNome.trim()) return;
    setSalvando(true);
    setError(null);
    try {
      await api.locaisFaxinaCreate({ nome: novoNome.trim() });
      setNovoNome('');
      await carregar();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erro ao criar local');
    } finally {
      setSalvando(false);
    }
  };

  const renomear = async (id: string, nome: string) => {
    try {
      await api.locaisFaxinaUpdate(id, { nome });
      await carregar();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erro ao renomear');
    }
  };

  const toggleAtivo = async (l: LocalFaxina) => {
    try {
      await api.locaisFaxinaUpdate(l.id, { ativo: !l.ativo });
      await carregar();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erro ao alterar status');
    }
  };

  const remover = async (l: LocalFaxina) => {
    if (!window.confirm(`Desativar local "${l.nome}"?`)) return;
    try {
      await api.locaisFaxinaDelete(l.id);
      await carregar();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erro ao remover');
    }
  };

  if (!isAdmin) {
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <Link to="/" className="text-sm text-cbmes-blue hover:underline">
          ← Home
        </Link>
        <p className="mt-4 text-sm text-slate-700">Acesso restrito a administradores.</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-cbmes-red px-4 py-4 text-white">
        <Link to="/" className="text-sm opacity-90 hover:opacity-100">
          ← Home
        </Link>
        <h1 className="mt-1 text-lg font-bold">Locais de Faxina</h1>
        <p className="text-xs opacity-90">
          Cadastro mestre dos locais usados na Escala de Faxina da Parte Diária.
        </p>
      </header>

      <section className="mx-auto max-w-2xl p-4">
        {error && (
          <div className="mb-3 rounded border border-feedback-error/30 bg-feedback-error/10 p-2 text-sm text-feedback-error">
            {error}
          </div>
        )}

        <div className="mb-4 flex gap-2">
          <input
            type="text"
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
            placeholder="Nome do local (ex.: COZINHA)"
            className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm uppercase"
          />
          <button
            type="button"
            onClick={criar}
            disabled={salvando || !novoNome.trim()}
            className="rounded bg-cbmes-blue px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            {salvando ? 'Salvando…' : '+ Novo'}
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-slate-500">Carregando…</p>
        ) : items.length === 0 ? (
          <p className="text-sm italic text-slate-500">Nenhum local cadastrado.</p>
        ) : (
          <ul className="divide-y divide-slate-200 rounded border border-slate-200 bg-white">
            {items.map((l) => (
              <li
                key={l.id}
                className={`flex items-center gap-2 p-2 ${l.ativo ? '' : 'opacity-50'}`}
              >
                <input
                  type="text"
                  defaultValue={l.nome}
                  onBlur={(e) => {
                    if (e.target.value.trim() && e.target.value.trim() !== l.nome) {
                      void renomear(l.id, e.target.value.trim());
                    }
                  }}
                  className="flex-1 rounded border border-transparent px-2 py-1 text-sm uppercase hover:border-slate-200 focus:border-slate-300"
                />
                <span className="text-xs text-slate-500">#{l.ordem}</span>
                <button
                  type="button"
                  onClick={() => void toggleAtivo(l)}
                  className="rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-50"
                >
                  {l.ativo ? 'Desativar' : 'Reativar'}
                </button>
                <button
                  type="button"
                  onClick={() => void remover(l)}
                  className="text-xs text-red-600 hover:underline"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

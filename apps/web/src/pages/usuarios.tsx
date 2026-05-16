import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  PAPEIS,
  type CreateUsuarioInput,
  type Papel,
  type UsuarioAdmin,
} from '@argus/shared-types';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

/**
 * S2.7 — CRUD admin de usuários (`/configuracoes/usuarios`).
 *
 * Elimina a necessidade de PR de código para cada novo militar liberado.
 * Senha inicial default = `batalhao01` (mesma do bootstrap); usuário é
 * forçado a trocar no primeiro acesso.
 *
 * Storage atual = in-memory (MOCK_USERS). Em S2.9 migra para Supabase.
 */

const PAPEL_LABEL: Record<Papel, string> = {
  admin: 'Administrador',
  fiscal: 'Fiscal',
  chefe_equipe: 'Chefe de Equipe',
  cov: 'COV',
  motorista: 'Motorista',
  operador: 'Operador',
  socorrista: 'Socorrista',
  dro: 'DRO',
  sentinela: 'Sentinela',
  sargenteante: 'Sargenteante',
  almoxarife: 'Almoxarife',
  militar: 'Militar',
};

export function UsuariosPage() {
  const { user: current } = useAuth();
  const [users, setUsers] = useState<UsuarioAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState('');
  const [editingNf, setEditingNf] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const reload = async () => {
    setLoading(true);
    try {
      const list = await api.usuariosList();
      setUsers(list);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erro ao carregar usuários');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const filtrados = useMemo(() => {
    if (!filtro.trim()) return users;
    const n = filtro.toUpperCase();
    return users.filter(
      (u) => u.nome.toUpperCase().includes(n) || u.nf.includes(n) || u.posto.includes(n),
    );
  }, [users, filtro]);

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-cbmes-blue px-4 py-4 text-white">
        <Link to="/" className="text-sm opacity-90 hover:opacity-100">
          ← Home
        </Link>
        <h1 className="mt-1 text-lg font-bold">👥 Usuários</h1>
        <p className="text-xs opacity-90">
          Cadastro de usuários autorizados · senha inicial: <code>batalhao01</code>
        </p>
      </header>

      <section className="mx-auto max-w-3xl p-4">
        <div className="rounded border border-slate-200 bg-white p-3 text-xs text-slate-600">
          <strong>Storage:</strong> in-memory (Fase 1). Usuários criados aqui se perdem
          ao restart do backend até a migração Supabase (S2.9). Para deploy permanente
          enquanto isso, ainda é necessário PR de código.
        </div>

        {error && (
          <div
            role="alert"
            className="mt-3 rounded border border-feedback-error/30 bg-feedback-error/10 p-3 text-sm text-feedback-error"
          >
            {error}
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <input
            type="text"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Buscar por nome, NF ou posto"
            className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="rounded-button bg-cbmes-red px-4 py-2 text-sm font-semibold text-white hover:bg-cbmes-red/90"
          >
            + Novo usuário
          </button>
        </div>

        {showCreate && (
          <UsuarioForm
            modo="create"
            onCancel={() => setShowCreate(false)}
            onSaved={async () => {
              setShowCreate(false);
              await reload();
            }}
          />
        )}

        {loading ? (
          <p className="mt-4 text-sm text-slate-500">Carregando…</p>
        ) : filtrados.length === 0 ? (
          <p className="mt-4 text-sm italic text-slate-500">
            Nenhum usuário encontrado.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-200 rounded border border-slate-200 bg-white">
            {filtrados.map((u) => (
              <li key={u.nf} className="p-3">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <strong className="text-slate-900">
                    {u.posto} {u.nome}
                  </strong>
                  <span className="text-xs text-slate-500">
                    NF {u.nf} · ANT {u.ant}
                  </span>
                  {u.primeiroAcesso && (
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                      PRIMEIRO ACESSO PENDENTE
                    </span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap gap-1 text-[11px]">
                  {u.papeis.map((p) => (
                    <span
                      key={p}
                      className="rounded bg-cbmes-blue/10 px-2 py-0.5 font-medium text-cbmes-blue"
                    >
                      {PAPEL_LABEL[p] ?? p}
                    </span>
                  ))}
                </div>
                <div className="mt-2 flex gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setEditingNf(u.nf)}
                    className="rounded border border-slate-300 px-2 py-1 text-slate-700 hover:bg-slate-100"
                  >
                    ✏️ Editar
                  </button>
                  {current?.nf !== u.nf && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (
                          !confirm(
                            `Remover ${u.posto} ${u.nome} (NF ${u.nf})? Esta ação não pode ser desfeita.`,
                          )
                        )
                          return;
                        try {
                          await api.usuarioRemove(u.nf);
                          await reload();
                        } catch (e) {
                          setError(
                            e instanceof ApiError ? e.message : 'Erro ao remover',
                          );
                        }
                      }}
                      className="rounded border border-feedback-error/40 px-2 py-1 text-feedback-error hover:bg-feedback-error/10"
                    >
                      🗑️ Remover
                    </button>
                  )}
                </div>
                {editingNf === u.nf && (
                  <UsuarioForm
                    modo="edit"
                    usuario={u}
                    onCancel={() => setEditingNf(null)}
                    onSaved={async () => {
                      setEditingNf(null);
                      await reload();
                    }}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

// ── Form CRUD ─────────────────────────────────────────────────────

function UsuarioForm({
  modo,
  usuario,
  onCancel,
  onSaved,
}: {
  modo: 'create' | 'edit';
  usuario?: UsuarioAdmin;
  onCancel: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [nf, setNf] = useState(usuario?.nf ?? '');
  const [nome, setNome] = useState(usuario?.nome ?? '');
  const [posto, setPosto] = useState(usuario?.posto ?? 'SD');
  const [ant, setAnt] = useState(usuario?.ant ?? 1000);
  const [papeis, setPapeis] = useState<Papel[]>(usuario?.papeis ?? ['militar']);
  const [resetSenha, setResetSenha] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const togglePapel = (p: Papel) => {
    setPapeis((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      if (modo === 'create') {
        const input: CreateUsuarioInput = { nf, nome, posto, ant, papeis };
        await api.usuarioCreate(input);
      } else if (usuario) {
        await api.usuarioUpdate(usuario.nf, { nome, posto, ant, papeis, resetSenha });
      }
      await onSaved();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Erro ao salvar');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-3 rounded border-2 border-cbmes-blue/40 bg-cbmes-blue/5 p-3 text-sm"
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label>
          <span className="text-xs font-medium text-slate-700">NF</span>
          <input
            type="text"
            value={nf}
            onChange={(e) => setNf(e.target.value.replace(/\D/g, ''))}
            disabled={modo === 'edit'}
            required
            inputMode="numeric"
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 disabled:bg-slate-100"
          />
        </label>
        <label>
          <span className="text-xs font-medium text-slate-700">Posto</span>
          <input
            type="text"
            value={posto}
            onChange={(e) => setPosto(e.target.value.toUpperCase())}
            required
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
          />
        </label>
        <label className="sm:col-span-2">
          <span className="text-xs font-medium text-slate-700">Nome completo</span>
          <input
            type="text"
            value={nome}
            onChange={(e) => setNome(e.target.value.toUpperCase())}
            required
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
          />
        </label>
        <label>
          <span className="text-xs font-medium text-slate-700">
            ANT (antiguidade)
          </span>
          <input
            type="number"
            value={ant}
            onChange={(e) => setAnt(Number.parseInt(e.target.value, 10) || 0)}
            required
            min={0}
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
          />
        </label>
      </div>

      <fieldset className="mt-3">
        <legend className="text-xs font-medium text-slate-700">Papéis</legend>
        <div className="mt-1 flex flex-wrap gap-1">
          {PAPEIS.map((p) => (
            <label
              key={p}
              className={`cursor-pointer rounded border px-2 py-1 text-[11px] ${
                papeis.includes(p)
                  ? 'border-cbmes-blue bg-cbmes-blue text-white'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <input
                type="checkbox"
                className="hidden"
                checked={papeis.includes(p)}
                onChange={() => togglePapel(p)}
              />
              {PAPEL_LABEL[p] ?? p}
            </label>
          ))}
        </div>
      </fieldset>

      {modo === 'edit' && (
        <label className="mt-3 flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={resetSenha}
            onChange={(e) => setResetSenha(e.target.checked)}
            className="h-4 w-4"
          />
          <span className="text-slate-700">
            Resetar senha para <code>batalhao01</code> (força troca no próximo login)
          </span>
        </label>
      )}

      {formError && (
        <div className="mt-2 rounded border border-feedback-error/30 bg-feedback-error/10 p-2 text-xs text-feedback-error">
          {formError}
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          disabled={submitting || papeis.length === 0}
          className="flex-1 rounded-button bg-cbmes-red py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {submitting ? 'Salvando…' : modo === 'create' ? 'Criar usuário' : 'Salvar alterações'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="flex-1 rounded-button border border-slate-300 bg-white py-2 text-sm text-slate-700"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

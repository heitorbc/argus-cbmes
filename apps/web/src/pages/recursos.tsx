import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CATEGORIA_RECURSO,
  type CategoriaRecurso,
  type CreateRecursoInput,
  type Recurso,
  type Unidade,
} from '@argus/shared-types';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

interface FormState {
  unidadeId: string;
  nome: string;
  categoria: CategoriaRecurso;
  ativo: boolean;
  comportaViatura: boolean;
  comportaEfetivo: boolean;
  ordem: number;
}

const CATEGORIA_LABEL: Record<CategoriaRecurso, string> = {
  OPERACIONAL: 'Operacional',
  STAFF: 'Staff (ChOp)',
  AQUATICA: 'Aquática (Mergulho/Salvamar)',
  GUARDA: 'Guarda',
};

const CATEGORIA_BADGE: Record<CategoriaRecurso, string> = {
  OPERACIONAL: 'bg-cbmes-red/10 text-cbmes-red',
  STAFF: 'bg-cbmes-blue/10 text-cbmes-blue',
  AQUATICA: 'bg-sky-500/10 text-sky-700',
  GUARDA: 'bg-amber-500/10 text-amber-800',
};

function emptyForm(unidadeId: string, ordem: number): FormState {
  return {
    unidadeId,
    nome: '',
    categoria: 'OPERACIONAL',
    ativo: true,
    comportaViatura: true,
    comportaEfetivo: true,
    ordem,
  };
}

export function RecursosPage() {
  const { user } = useAuth();
  const isAdmin = user?.papeis.includes('admin') ?? false;

  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [unidadeFiltro, setUnidadeFiltro] = useState<string>('');
  const [recursos, setRecursos] = useState<Recurso[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInativos, setShowInativos] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm('', 0));
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const reloadRecursos = async (unidadeId: string) => {
    setLoading(true);
    try {
      const list = await api.recursosList({ unidadeId: unidadeId || undefined });
      setRecursos(list);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erro ao carregar recursos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    api
      .unidadesList()
      .then((us) => {
        if (cancelled) return;
        setUnidades(us);
        const primeira = us.find((u) => u.ativo) ?? us[0];
        if (primeira) {
          setUnidadeFiltro(primeira.id);
        } else {
          setLoading(false);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : 'Erro ao carregar unidades');
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (unidadeFiltro) void reloadRecursos(unidadeFiltro);
  }, [unidadeFiltro]);

  const recursosVisiveis = useMemo(
    () => (showInativos ? recursos : recursos.filter((r) => r.ativo)),
    [recursos, showInativos],
  );

  const proximaOrdem = useMemo(() => {
    if (recursos.length === 0) return 1;
    return Math.max(...recursos.map((r) => r.ordem)) + 1;
  }, [recursos]);

  const startCreate = () => {
    setForm(emptyForm(unidadeFiltro, proximaOrdem));
    setEditingId(null);
    setFormError(null);
    setShowForm(true);
  };

  const startEdit = (r: Recurso) => {
    setForm({
      unidadeId: r.unidadeId,
      nome: r.nome,
      categoria: r.categoria,
      ativo: r.ativo,
      comportaViatura: r.comportaViatura,
      comportaEfetivo: r.comportaEfetivo,
      ordem: r.ordem,
    });
    setEditingId(r.id);
    setFormError(null);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      if (editingId) {
        await api.recursosUpdate(editingId, {
          nome: form.nome,
          categoria: form.categoria,
          ativo: form.ativo,
          comportaViatura: form.comportaViatura,
          comportaEfetivo: form.comportaEfetivo,
          ordem: form.ordem,
        });
      } else {
        const input: CreateRecursoInput = {
          unidadeId: form.unidadeId,
          nome: form.nome,
          categoria: form.categoria,
          ativo: form.ativo,
          comportaViatura: form.comportaViatura,
          comportaEfetivo: form.comportaEfetivo,
          ordem: form.ordem,
        };
        await api.recursosCreate(input);
      }
      setShowForm(false);
      setEditingId(null);
      await reloadRecursos(unidadeFiltro);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleSoftDelete = async (r: Recurso) => {
    if (!confirm(`Desativar o recurso "${r.nome}"? (reativável depois via Editar)`)) return;
    try {
      await api.recursosSoftDelete(r.id);
      await reloadRecursos(unidadeFiltro);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao desativar');
    }
  };

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-slate-700 px-4 py-4 text-white">
        <Link to="/" className="text-sm opacity-90 hover:opacity-100">
          ← Início
        </Link>
        <h1 className="mt-1 text-lg font-bold">Recursos</h1>
        <p className="text-xs opacity-90">Configurações · Recursos por unidade (ABTS, ATB, …)</p>
      </header>

      <section className="mx-auto max-w-3xl p-4">
        <div className="rounded border border-slate-200 bg-white p-3 text-xs text-slate-700">
          <p>
            <strong>S6e:</strong> CRUD admin de Recursos. Substitui a antiga whitelist hardcoded
            (`RECURSOS_VALIDOS`). Categoria define como o recurso aparece na Prévia (Operacional /
            Staff / Aquática / Guarda).
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="mt-3 rounded border border-feedback-error/30 bg-feedback-error/10 p-3 text-sm text-feedback-error"
          >
            {error}
          </div>
        )}

        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
          <label className="block">
            <span className="text-xs font-medium text-slate-700">Unidade</span>
            <select
              value={unidadeFiltro}
              onChange={(e) => setUnidadeFiltro(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-base"
            >
              {unidades.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.codigo} — {u.nome}
                  {!u.ativo ? ' (inativa)' : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 sm:pb-2">
            <input
              type="checkbox"
              checked={showInativos}
              onChange={(e) => setShowInativos(e.target.checked)}
              className="h-5 w-5"
            />
            <span className="text-xs text-slate-700">Mostrar inativos</span>
          </label>
        </div>

        {isAdmin && !showForm && unidadeFiltro && (
          <button
            type="button"
            onClick={startCreate}
            className="mt-3 w-full rounded-button bg-cbmes-red py-2.5 text-base font-semibold text-white"
          >
            + Novo recurso
          </button>
        )}
        {!isAdmin && (
          <p className="mt-3 rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
            Apenas administradores podem criar/editar recursos.
          </p>
        )}

        {showForm && isAdmin && (
          <form
            onSubmit={handleSubmit}
            className="mt-3 space-y-3 rounded border border-slate-300 bg-white p-4"
          >
            <h2 className="text-sm font-semibold text-slate-700">
              {editingId ? 'Editar recurso' : 'Novo recurso'}
            </h2>

            <label className="block">
              <span className="text-sm font-medium text-slate-700">
                Nome <span className="text-feedback-error">*</span>
              </span>
              <input
                type="text"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="Ex.: ABTS_03 ou MERGULHO 03"
                required
                disabled={!!editingId}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-base disabled:bg-slate-100"
              />
              {editingId && (
                <p className="mt-1 text-[11px] text-slate-500">
                  Nome (id) não pode ser alterado em edição (rebaixaria histórico). Crie um novo
                  recurso e desative o antigo se precisar renomear.
                </p>
              )}
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">
                  Categoria <span className="text-feedback-error">*</span>
                </span>
                <select
                  value={form.categoria}
                  onChange={(e) =>
                    setForm({ ...form, categoria: e.target.value as CategoriaRecurso })
                  }
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-base"
                >
                  {CATEGORIA_RECURSO.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORIA_LABEL[c]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-700">Ordem</span>
                <input
                  type="number"
                  min={0}
                  value={form.ordem}
                  onChange={(e) => setForm({ ...form, ordem: Number(e.target.value) })}
                  className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-base"
                />
              </label>
            </div>

            <fieldset className="space-y-1.5 rounded border border-slate-200 bg-slate-50 p-3">
              <legend className="px-1 text-xs font-medium text-slate-700">
                Capacidades (espelham colunas do MF)
              </legend>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.comportaViatura}
                  onChange={(e) => setForm({ ...form, comportaViatura: e.target.checked })}
                  className="h-5 w-5"
                />
                <span className="text-sm text-slate-700">Comporta viatura (col B/C do MF)</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.comportaEfetivo}
                  onChange={(e) => setForm({ ...form, comportaEfetivo: e.target.checked })}
                  className="h-5 w-5"
                />
                <span className="text-sm text-slate-700">
                  Comporta efetivo (chefe/motorista/operadores)
                </span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.ativo}
                  onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
                  className="h-5 w-5"
                />
                <span className="text-sm text-slate-700">Ativo (parser MF considera)</span>
              </label>
            </fieldset>

            {formError && (
              <p className="rounded border border-feedback-error/30 bg-feedback-error/10 p-2 text-xs text-feedback-error">
                {formError}
              </p>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 rounded-button bg-cbmes-red py-2 text-base font-semibold text-white disabled:opacity-60"
              >
                {saving ? 'Salvando…' : editingId ? 'Salvar alterações' : 'Criar recurso'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingId(null);
                }}
                className="flex-1 rounded-button border border-slate-300 bg-white py-2 text-base text-slate-700"
              >
                Cancelar
              </button>
            </div>
          </form>
        )}

        <div className="mt-4 space-y-2">
          {loading && <p className="text-sm text-slate-500">Carregando…</p>}
          {!loading && recursosVisiveis.length === 0 && (
            <p className="text-sm text-slate-500">
              {recursos.length === 0 ? 'Nenhum recurso cadastrado.' : 'Nenhum recurso visível.'}
            </p>
          )}
          {recursosVisiveis.map((r) => (
            <div
              key={r.id}
              className={`rounded border p-3 ${
                r.ativo ? 'border-slate-200 bg-white' : 'border-slate-300 bg-slate-100 opacity-70'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-cbmes-blue">
                    <span className="text-xs text-slate-500">#{r.ordem}</span> {r.nome}
                    <span
                      className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${CATEGORIA_BADGE[r.categoria]}`}
                    >
                      {r.categoria}
                    </span>
                    {!r.ativo && (
                      <span className="ml-1 rounded-full bg-slate-300 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-700">
                        inativo
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-slate-600">
                    {r.comportaViatura ? '🚒 viatura' : '— sem viatura'} ·{' '}
                    {r.comportaEfetivo ? '👥 efetivo' : '— sem efetivo'}
                  </p>
                  <p className="mt-0.5 text-[10px] text-slate-400">{r.id}</p>
                </div>
                {isAdmin && (
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => startEdit(r)}
                      className="rounded border border-cbmes-blue px-3 py-1 text-xs font-medium text-cbmes-blue hover:bg-cbmes-blue/10"
                    >
                      Editar
                    </button>
                    {r.ativo && (
                      <button
                        type="button"
                        onClick={() => handleSoftDelete(r)}
                        className="rounded border border-feedback-error px-3 py-1 text-xs font-medium text-feedback-error hover:bg-feedback-error/10"
                      >
                        Desativar
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

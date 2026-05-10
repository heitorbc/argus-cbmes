import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { CreateUnidadeInput, Unidade } from '@argus/shared-types';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

interface FormState {
  codigo: string;
  nome: string;
  ativo: boolean;
}

const EMPTY_FORM: FormState = {
  codigo: '',
  nome: '',
  ativo: true,
};

export function UnidadesPage() {
  const { user } = useAuth();
  const isAdmin = user?.papeis.includes('admin') ?? false;

  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    try {
      const list = await api.unidadesList();
      setUnidades(list);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erro ao carregar unidades');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const startCreate = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setFormError(null);
    setShowForm(true);
  };

  const startEdit = (u: Unidade) => {
    setForm({ codigo: u.codigo, nome: u.nome, ativo: u.ativo });
    setEditingId(u.id);
    setFormError(null);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      if (editingId) {
        await api.unidadesUpdate(editingId, {
          codigo: form.codigo,
          nome: form.nome,
          ativo: form.ativo,
        });
      } else {
        const input: CreateUnidadeInput = {
          codigo: form.codigo,
          nome: form.nome,
          ativo: form.ativo,
        };
        await api.unidadesCreate(input);
      }
      setForm(EMPTY_FORM);
      setShowForm(false);
      setEditingId(null);
      await reload();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleSoftDelete = async (u: Unidade) => {
    if (!confirm(`Desativar a unidade "${u.codigo}"? (soft delete; pode reativar depois)`)) return;
    try {
      await api.unidadesSoftDelete(u.id);
      await reload();
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
        <h1 className="mt-1 text-lg font-bold">Unidades</h1>
        <p className="text-xs opacity-90">Configurações · Cias/BBMs do sistema</p>
      </header>

      <section className="mx-auto max-w-3xl p-4">
        <div className="rounded border border-slate-200 bg-white p-3 text-xs text-slate-700">
          <p>
            <strong>S6e:</strong> CRUD admin de Unidades. Soft delete preserva histórico (recursos
            vinculados não são removidos). Para reativar, edite e marque "ativo".
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

        {isAdmin && !showForm && (
          <button
            type="button"
            onClick={startCreate}
            className="mt-3 w-full rounded-button bg-cbmes-red py-2.5 text-base font-semibold text-white"
          >
            + Nova unidade
          </button>
        )}
        {!isAdmin && (
          <p className="mt-3 rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
            Apenas administradores podem criar/editar unidades.
          </p>
        )}

        {showForm && isAdmin && (
          <form
            onSubmit={handleSubmit}
            className="mt-3 space-y-3 rounded border border-slate-300 bg-white p-4"
          >
            <h2 className="text-sm font-semibold text-slate-700">
              {editingId ? 'Editar unidade' : 'Nova unidade'}
            </h2>

            <label className="block">
              <span className="text-sm font-medium text-slate-700">
                Código <span className="text-feedback-error">*</span>
              </span>
              <input
                type="text"
                value={form.codigo}
                onChange={(e) => setForm({ ...form, codigo: e.target.value })}
                placeholder="Ex.: 1ª1º"
                required
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-base"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700">
                Nome <span className="text-feedback-error">*</span>
              </span>
              <input
                type="text"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="Ex.: 1ª Cia / 1º BBM"
                required
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-base"
              />
            </label>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.ativo}
                onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
                className="h-5 w-5"
              />
              <span className="text-sm text-slate-700">Ativo</span>
            </label>

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
                {saving ? 'Salvando…' : editingId ? 'Salvar alterações' : 'Criar unidade'}
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
          {!loading && unidades.length === 0 && (
            <p className="text-sm text-slate-500">Nenhuma unidade cadastrada.</p>
          )}
          {unidades.map((u) => (
            <div
              key={u.id}
              className={`rounded border p-3 ${
                u.ativo ? 'border-slate-200 bg-white' : 'border-slate-300 bg-slate-100 opacity-70'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-cbmes-blue">
                    {u.codigo}
                    {!u.ativo && (
                      <span className="ml-2 rounded-full bg-slate-300 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-700">
                        inativo
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-slate-700">{u.nome}</p>
                  <p className="mt-0.5 text-[10px] text-slate-400">{u.id}</p>
                </div>
                {isAdmin && (
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => startEdit(u)}
                      className="rounded border border-cbmes-blue px-3 py-1 text-xs font-medium text-cbmes-blue hover:bg-cbmes-blue/10"
                    >
                      Editar
                    </button>
                    {u.ativo && (
                      <button
                        type="button"
                        onClick={() => handleSoftDelete(u)}
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

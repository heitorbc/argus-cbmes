import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  STATUS_VIATURA,
  STATUS_VIATURA_LABEL,
  TIPOS_VIATURA,
  TIPO_VIATURA_LABEL,
  type StatusViatura,
  type Viatura,
} from '@argus/shared-types';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

interface FormState {
  prefixo: string;
  tipo: (typeof TIPOS_VIATURA)[number];
  status: StatusViatura;
  funcaoOperacional: string;
  observacoes: string;
}

const EMPTY_FORM: FormState = {
  prefixo: '',
  tipo: 'AU',
  status: 'operacional',
  funcaoOperacional: '',
  observacoes: '',
};

export function ViaturasPage() {
  const { user } = useAuth();
  const isAdmin = user?.papeis.includes('admin') ?? false;

  const [viaturas, setViaturas] = useState<Viatura[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    try {
      const list = await api.viaturasList();
      setViaturas(list);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erro ao carregar viaturas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowForm(true);
  };

  const openEdit = (v: Viatura) => {
    setEditingId(v.id);
    setForm({
      prefixo: v.prefixo,
      tipo: v.tipo,
      status: v.status,
      funcaoOperacional: v.funcaoOperacional ?? '',
      observacoes: v.observacoes ?? '',
    });
    setFormError(null);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormError(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        prefixo: form.prefixo.trim().toUpperCase(),
        tipo: form.tipo,
        status: form.status,
        funcaoOperacional: form.funcaoOperacional.trim() || undefined,
        observacoes: form.observacoes.trim() || undefined,
        composicaoFuncoes: [],
      };
      if (editingId) {
        await api.viaturasUpdate(editingId, payload);
      } else {
        await api.viaturasCreate(payload);
      }
      await reload();
      closeForm();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleSoftDelete = async (v: Viatura) => {
    if (!confirm(`Marcar ${v.prefixo} como BAIXADA?`)) return;
    try {
      await api.viaturasSoftDelete(v.id);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao baixar viatura');
    }
  };

  const handleStatusChange = async (v: Viatura, status: StatusViatura) => {
    try {
      await api.viaturasUpdate(v.id, { status });
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao alterar status');
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
        <h1 className="mt-1 text-lg font-bold">Viaturas</h1>
        <p className="text-xs opacity-90">Cadastros Mestre</p>
      </header>

      <section className="mx-auto max-w-3xl p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-600">
            {viaturas.length} viatura{viaturas.length === 1 ? '' : 's'}
          </p>
          {isAdmin && !showForm && (
            <button
              type="button"
              onClick={openCreate}
              className="rounded-button bg-cbmes-red px-4 py-2 text-sm font-semibold text-white transition hover:bg-cbmes-red/90"
            >
              + Nova viatura
            </button>
          )}
        </div>

        {error && (
          <div
            role="alert"
            className="mt-4 rounded border border-feedback-error/30 bg-feedback-error/10 p-3 text-sm text-feedback-error"
          >
            {error}
          </div>
        )}

        {showForm && isAdmin && (
          <form
            onSubmit={handleSave}
            className="mt-4 space-y-3 rounded border border-cbmes-blue/30 bg-white p-4"
          >
            <h2 className="text-base font-semibold text-cbmes-blue">
              {editingId ? 'Editar viatura' : 'Nova viatura'}
            </h2>
            <div>
              <label htmlFor="prefixo" className="mb-1 block text-sm font-medium text-slate-700">
                Prefixo
              </label>
              <input
                id="prefixo"
                type="text"
                required
                value={form.prefixo}
                onChange={(e) => setForm({ ...form, prefixo: e.target.value })}
                placeholder="ABTS 011"
                pattern="[A-Z]{2,4} \d{3}"
                title='Formato: "ABTS 011" (2-4 letras maiúsculas, espaço, 3 dígitos)'
                className="w-full rounded border border-slate-300 px-3 py-2 text-base"
              />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label htmlFor="tipo" className="mb-1 block text-sm font-medium text-slate-700">
                  Tipo
                </label>
                <select
                  id="tipo"
                  value={form.tipo}
                  onChange={(e) => setForm({ ...form, tipo: e.target.value as FormState['tipo'] })}
                  className="w-full rounded border border-slate-300 px-3 py-2 text-base"
                >
                  {TIPOS_VIATURA.map((t) => (
                    <option key={t} value={t}>
                      {t} — {TIPO_VIATURA_LABEL[t]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label htmlFor="status" className="mb-1 block text-sm font-medium text-slate-700">
                  Status
                </label>
                <select
                  id="status"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as StatusViatura })}
                  className="w-full rounded border border-slate-300 px-3 py-2 text-base"
                >
                  {STATUS_VIATURA.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_VIATURA_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="funcao" className="mb-1 block text-sm font-medium text-slate-700">
                Função operacional
              </label>
              <input
                id="funcao"
                type="text"
                value={form.funcaoOperacional}
                onChange={(e) => setForm({ ...form, funcaoOperacional: e.target.value })}
                placeholder="ex.: Auto-Bomba Tanque-Salvamento"
                className="w-full rounded border border-slate-300 px-3 py-2 text-base"
              />
            </div>
            <div>
              <label htmlFor="obs" className="mb-1 block text-sm font-medium text-slate-700">
                Observações
              </label>
              <textarea
                id="obs"
                rows={2}
                value={form.observacoes}
                onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                className="w-full rounded border border-slate-300 px-3 py-2 text-base"
              />
            </div>
            {formError && (
              <p role="alert" className="text-sm text-feedback-error">
                {formError}
              </p>
            )}
            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 rounded-button bg-cbmes-red py-2 text-base font-semibold text-white disabled:opacity-60"
              >
                {saving ? 'Salvando…' : 'Salvar'}
              </button>
              <button
                type="button"
                onClick={closeForm}
                disabled={saving}
                className="flex-1 rounded-button border border-slate-300 bg-white py-2 text-base text-slate-700"
              >
                Cancelar
              </button>
            </div>
          </form>
        )}

        {loading && viaturas.length === 0 && (
          <p className="mt-6 text-center text-sm text-slate-500">Carregando viaturas…</p>
        )}

        <ul className="mt-4 divide-y divide-slate-200 rounded border border-slate-200 bg-white">
          {viaturas.map((v) => (
            <li key={v.id} className="p-3 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-medium text-cbmes-blue">{v.prefixo}</span>
                <StatusBadge status={v.status} />
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {TIPO_VIATURA_LABEL[v.tipo]}
                {v.funcaoOperacional && ` · ${v.funcaoOperacional}`}
              </div>
              {v.observacoes && (
                <p className="mt-1 text-xs italic text-slate-500">{v.observacoes}</p>
              )}
              {isAdmin && !showForm && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => openEdit(v)}
                    className="rounded-button border border-cbmes-blue px-3 py-1 text-xs font-medium text-cbmes-blue hover:bg-cbmes-blue/10"
                  >
                    Editar
                  </button>
                  <select
                    value={v.status}
                    onChange={(e) => handleStatusChange(v, e.target.value as StatusViatura)}
                    aria-label={`Mudar status de ${v.prefixo}`}
                    className="rounded border border-slate-300 px-2 py-1 text-xs"
                  >
                    {STATUS_VIATURA.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_VIATURA_LABEL[s]}
                      </option>
                    ))}
                  </select>
                  {v.status !== 'baixada' && (
                    <button
                      type="button"
                      onClick={() => handleSoftDelete(v)}
                      className="rounded-button border border-feedback-error px-3 py-1 text-xs font-medium text-feedback-error hover:bg-feedback-error/10"
                    >
                      Baixar
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function StatusBadge({ status }: { status: StatusViatura }) {
  const cls: Record<StatusViatura, string> = {
    operacional: 'bg-feedback-success/15 text-feedback-success',
    em_manutencao: 'bg-feedback-warn/15 text-feedback-warn',
    baixada: 'bg-slate-200 text-slate-700',
    reserva: 'bg-cbmes-blue/15 text-cbmes-blue',
  };
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${cls[status]}`}>
      {STATUS_VIATURA_LABEL[status]}
    </span>
  );
}

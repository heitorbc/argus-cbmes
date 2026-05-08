import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { CreateFiscalInput, FiscalCadastrado, Militar } from '@argus/shared-types';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

interface FormState {
  militarNf: string;
  equipe: '' | 'A' | 'B' | 'C' | 'D';
  vigenciaInicio: string;
  vigenciaFim: string;
  motivo: string;
}

const EMPTY_FORM: FormState = {
  militarNf: '',
  equipe: '',
  vigenciaInicio: '',
  vigenciaFim: '',
  motivo: '',
};

export function FiscaisPage() {
  const { user } = useAuth();
  const isAdmin = user?.papeis.includes('admin') ?? false;

  const [fiscais, setFiscais] = useState<FiscalCadastrado[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [militarPreview, setMilitarPreview] = useState<Militar | null>(null);

  const reload = async () => {
    setLoading(true);
    try {
      const list = await api.fiscaisList();
      setFiscais(list);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erro ao carregar fiscais');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  // Preview do militar quando NF é digitado (lookup no /efetivo/:nf)
  useEffect(() => {
    const nf = form.militarNf.trim();
    if (!/^\d{6,8}$/.test(nf)) {
      setMilitarPreview(null);
      return;
    }
    let cancelled = false;
    api
      .efetivoFindByNf(nf)
      .then((m) => {
        if (!cancelled) setMilitarPreview(m);
      })
      .catch(() => {
        if (!cancelled) setMilitarPreview(null);
      });
    return () => {
      cancelled = true;
    };
  }, [form.militarNf]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const input: CreateFiscalInput = {
        militarNf: form.militarNf.trim(),
        equipe: form.equipe || undefined,
        vigenciaInicio: form.vigenciaInicio,
        vigenciaFim: form.vigenciaFim || undefined,
        motivo: form.motivo.trim() || undefined,
      };
      await api.fiscaisCreate(input);
      setForm(EMPTY_FORM);
      setShowForm(false);
      await reload();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (f: FiscalCadastrado) => {
    if (!confirm(`Remover cadastro de Fiscal NF ${f.militarNf}?`)) return;
    try {
      await api.fiscaisDelete(f.id);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao remover');
    }
  };

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-cbmes-red px-4 py-4 text-white">
        <Link to="/" className="text-sm opacity-90 hover:opacity-100">
          ← Início
        </Link>
        <h1 className="mt-1 text-lg font-bold">Fiscais de Serviço</h1>
        <p className="text-xs opacity-90">Cadastros Mestre · Override do cálculo automático</p>
      </header>

      <section className="mx-auto max-w-3xl p-4">
        <div className="rounded border border-slate-200 bg-white p-3 text-xs text-slate-700">
          <p>
            <strong>Cálculo padrão:</strong> Fiscal de Serviço = militar de menor ANT entre os
            escalados na equipe daquele dia.
          </p>
          <p className="mt-1">
            Use cadastros explícitos abaixo para sobrescrever em casos extraordinários (substituição
            durante curso, dispensa, etc.).
          </p>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-slate-600">
            {fiscais.length} cadastro{fiscais.length === 1 ? '' : 's'}
          </p>
          {isAdmin && !showForm && (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="rounded-button bg-cbmes-red px-4 py-2 text-sm font-semibold text-white transition hover:bg-cbmes-red/90"
            >
              + Cadastrar Fiscal
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
            onSubmit={handleSubmit}
            className="mt-4 space-y-3 rounded border border-cbmes-blue/30 bg-white p-4"
          >
            <h2 className="text-base font-semibold text-cbmes-blue">Novo cadastro</h2>

            <div>
              <label htmlFor="militarNf" className="mb-1 block text-sm font-medium text-slate-700">
                NF do militar
              </label>
              <input
                id="militarNf"
                type="text"
                inputMode="numeric"
                required
                pattern="\d{6,8}"
                value={form.militarNf}
                onChange={(e) => setForm({ ...form, militarNf: e.target.value })}
                placeholder="3037509"
                className="w-full rounded border border-slate-300 px-3 py-2 text-base"
              />
              {militarPreview && (
                <p className="mt-1 text-xs text-cbmes-blue">
                  ✓ {militarPreview.posto}{' '}
                  {militarPreview.nomeGuerra ?? militarPreview.nome.split(' ')[0]} —{' '}
                  {militarPreview.nome}
                </p>
              )}
              {!militarPreview && form.militarNf.length >= 6 && (
                <p className="mt-1 text-xs text-feedback-warn">⚠️ NF não encontrada no efetivo</p>
              )}
            </div>

            <div>
              <label htmlFor="equipe" className="mb-1 block text-sm font-medium text-slate-700">
                Equipe (opcional — vazio = qualquer)
              </label>
              <select
                id="equipe"
                value={form.equipe}
                onChange={(e) =>
                  setForm({ ...form, equipe: e.target.value as FormState['equipe'] })
                }
                className="w-full rounded border border-slate-300 px-3 py-2 text-base"
              >
                <option value="">Qualquer equipe</option>
                <option value="A">ALFA</option>
                <option value="B">BRAVO</option>
                <option value="C">CHARLIE</option>
                <option value="D">DELTA</option>
              </select>
            </div>

            <div className="flex gap-2">
              <div className="flex-1">
                <label
                  htmlFor="vigenciaInicio"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Início da vigência
                </label>
                <input
                  id="vigenciaInicio"
                  type="date"
                  required
                  value={form.vigenciaInicio}
                  onChange={(e) => setForm({ ...form, vigenciaInicio: e.target.value })}
                  className="w-full rounded border border-slate-300 px-3 py-2 text-base"
                />
              </div>
              <div className="flex-1">
                <label
                  htmlFor="vigenciaFim"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Fim (opcional)
                </label>
                <input
                  id="vigenciaFim"
                  type="date"
                  value={form.vigenciaFim}
                  onChange={(e) => setForm({ ...form, vigenciaFim: e.target.value })}
                  className="w-full rounded border border-slate-300 px-3 py-2 text-base"
                />
              </div>
            </div>

            <div>
              <label htmlFor="motivo" className="mb-1 block text-sm font-medium text-slate-700">
                Motivo (opcional)
              </label>
              <input
                id="motivo"
                type="text"
                value={form.motivo}
                onChange={(e) => setForm({ ...form, motivo: e.target.value })}
                placeholder="ex.: substituto durante CHS"
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
                onClick={() => {
                  setShowForm(false);
                  setForm(EMPTY_FORM);
                  setFormError(null);
                }}
                disabled={saving}
                className="flex-1 rounded-button border border-slate-300 bg-white py-2 text-base text-slate-700"
              >
                Cancelar
              </button>
            </div>
          </form>
        )}

        {loading && fiscais.length === 0 && (
          <p className="mt-6 text-center text-sm text-slate-500">Carregando…</p>
        )}

        <ul className="mt-4 divide-y divide-slate-200 rounded border border-slate-200 bg-white">
          {fiscais.length === 0 && !loading && (
            <li className="p-4 text-center text-sm text-slate-500">
              Nenhum Fiscal cadastrado. O cálculo padrão (menor ANT) é aplicado para todas as
              equipes.
            </li>
          )}
          {fiscais.map((f) => (
            <li key={f.id} className="p-3 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-medium text-cbmes-blue">NF {f.militarNf}</span>
                <span className="shrink-0 text-xs text-slate-500">
                  {f.equipe ? `Equipe ${f.equipe}` : 'Qualquer equipe'}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Vigência: {f.vigenciaInicio}
                {f.vigenciaFim ? ` → ${f.vigenciaFim}` : ' → indefinido'}
              </p>
              {f.motivo && <p className="mt-1 text-xs italic text-slate-500">{f.motivo}</p>}
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => handleDelete(f)}
                  className="mt-2 rounded-button border border-feedback-error px-3 py-1 text-xs font-medium text-feedback-error hover:bg-feedback-error/10"
                >
                  Remover
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

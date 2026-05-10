import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  STATUS_VIATURA,
  STATUS_VIATURA_LABEL,
  TIPOS_COMBUSTIVEL,
  TIPOS_VIATURA,
  TIPO_COMBUSTIVEL_LABEL,
  TIPO_VIATURA_LABEL,
  type StatusViatura,
  type TipoCombustivel,
  type Viatura,
} from '@argus/shared-types';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { MilitarSelect } from '@/components/militar-select';

interface FormState {
  prefixo: string;
  tipo: (typeof TIPOS_VIATURA)[number];
  status: StatusViatura;
  funcaoOperacional: string;
  observacoes: string;
  kmAtual: string;
  tipoCombustivel: TipoCombustivel | '';
  usaArla32: boolean;
  capacidadeTanqueLitros: string;
  alturaMetros: string;
  larguraMetros: string;
  militarResponsavelNf: string;
  militarResponsavelNome: string;
}

const EMPTY_FORM: FormState = {
  prefixo: '',
  tipo: 'AU',
  status: 'DISPONIVEL',
  funcaoOperacional: '',
  observacoes: '',
  kmAtual: '',
  tipoCombustivel: '',
  usaArla32: false,
  capacidadeTanqueLitros: '',
  alturaMetros: '',
  larguraMetros: '',
  militarResponsavelNf: '',
  militarResponsavelNome: '',
};

const STATUS_BADGE_CLASS: Record<StatusViatura, string> = {
  DISPONIVEL: 'bg-feedback-success/15 text-feedback-success',
  BAIXADA: 'bg-slate-200 text-slate-700',
  EMPRESTADA: 'bg-cbmes-blue/15 text-cbmes-blue',
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

  const editingFromMf =
    editingId !== null && viaturas.find((v) => v.id === editingId)?.origem === 'mapa_forca';

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
      kmAtual: v.kmAtual !== undefined ? String(v.kmAtual) : '',
      tipoCombustivel: v.tipoCombustivel ?? '',
      usaArla32: v.usaArla32 ?? false,
      capacidadeTanqueLitros:
        v.capacidadeTanqueLitros !== undefined ? String(v.capacidadeTanqueLitros) : '',
      alturaMetros: v.alturaMetros !== undefined ? String(v.alturaMetros) : '',
      larguraMetros: v.larguraMetros !== undefined ? String(v.larguraMetros) : '',
      militarResponsavelNf: v.militarResponsavelNf ?? '',
      militarResponsavelNome: '',
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
      const num = (s: string) => (s.trim() === '' ? undefined : Number(s));
      const payload = {
        prefixo: form.prefixo.trim(),
        tipo: form.tipo,
        status: form.status,
        funcaoOperacional: form.funcaoOperacional.trim() || undefined,
        observacoes: form.observacoes.trim() || undefined,
        composicaoFuncoes: [],
        kmAtual: num(form.kmAtual),
        tipoCombustivel: form.tipoCombustivel || undefined,
        usaArla32: form.usaArla32 || undefined,
        capacidadeTanqueLitros: num(form.capacidadeTanqueLitros),
        alturaMetros: num(form.alturaMetros),
        larguraMetros: num(form.larguraMetros),
        militarResponsavelNf: form.militarResponsavelNf.trim() || undefined,
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
    if (v.origem === 'mapa_forca') {
      setError('Viatura do Mapa Força — baixa só via Conferência da Viatura (S6b).');
      return;
    }
    if (!confirm(`Marcar ${v.prefixo} como BAIXADA?`)) return;
    try {
      await api.viaturasSoftDelete(v.id);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao baixar viatura');
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
        <p className="text-xs opacity-90">
          Cadastros Mestre · status sincronizado com Mapa Força (col C)
        </p>
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
              + Nova viatura (override)
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
          <ViaturaForm
            form={form}
            setForm={setForm}
            editingFromMf={editingFromMf}
            saving={saving}
            formError={formError}
            onSave={handleSave}
            onCancel={closeForm}
          />
        )}

        {loading && viaturas.length === 0 && (
          <p className="mt-6 text-center text-sm text-slate-500">Carregando viaturas…</p>
        )}

        <ul className="mt-4 divide-y divide-slate-200 rounded border border-slate-200 bg-white">
          {viaturas.map((v) => (
            <li key={v.id} className="p-3 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-medium text-cbmes-blue">
                  {v.prefixo}
                  {v.origem === 'mapa_forca' && (
                    <span
                      className="ml-2 rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-bold text-amber-900"
                      title="Viatura gerenciada pelo Mapa Força"
                    >
                      MF
                    </span>
                  )}
                </span>
                <StatusBadge status={v.status} />
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {TIPO_VIATURA_LABEL[v.tipo]}
                {v.funcaoOperacional && ` · ${v.funcaoOperacional}`}
              </div>
              {(v.kmAtual !== undefined || v.tipoCombustivel || v.militarResponsavelNf) && (
                <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-slate-500">
                  {v.kmAtual !== undefined && (
                    <span>🛞 {v.kmAtual.toLocaleString('pt-BR')} km</span>
                  )}
                  {v.tipoCombustivel && <span>⛽ {TIPO_COMBUSTIVEL_LABEL[v.tipoCombustivel]}</span>}
                  {v.usaArla32 && <span>💧 ARLA32</span>}
                  {v.militarResponsavelNf && <span>👤 NF {v.militarResponsavelNf}</span>}
                </div>
              )}
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
                    {v.origem === 'mapa_forca' ? 'Editar (campos auxiliares)' : 'Editar'}
                  </button>
                  {v.origem === 'override_admin' && v.status !== 'BAIXADA' && (
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
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASS[status]}`}
    >
      {STATUS_VIATURA_LABEL[status]}
    </span>
  );
}

interface ViaturaFormProps {
  form: FormState;
  setForm: (f: FormState | ((prev: FormState) => FormState)) => void;
  editingFromMf: boolean;
  saving: boolean;
  formError: string | null;
  onSave: (e: React.FormEvent) => void;
  onCancel: () => void;
}

function ViaturaForm({
  form,
  setForm,
  editingFromMf,
  saving,
  formError,
  onSave,
  onCancel,
}: ViaturaFormProps) {
  return (
    <form
      onSubmit={onSave}
      className="mt-4 space-y-3 rounded border border-cbmes-blue/30 bg-white p-4"
    >
      <h2 className="text-base font-semibold text-cbmes-blue">
        {form.prefixo ? `Editar ${form.prefixo}` : 'Nova viatura'}
      </h2>

      {editingFromMf && (
        <div className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
          ⚠️ Esta viatura é gerenciada pelo <strong>Mapa Força</strong>. Status e prefixo são{' '}
          travados — só mudam via <em>Conferência da Viatura</em> (S6b). Campos auxiliares (KM,
          combustível, militar responsável, etc.) podem ser editados.
        </div>
      )}

      <div>
        <label htmlFor="prefixo" className="mb-1 block text-sm font-medium text-slate-700">
          Prefixo
        </label>
        <input
          id="prefixo"
          type="text"
          required
          disabled={editingFromMf}
          value={form.prefixo}
          onChange={(e) => setForm({ ...form, prefixo: e.target.value })}
          placeholder="ABTS 011 ou AM_002"
          pattern="[A-Z]{2,4}[ _]\d{3}"
          title='Formato: "ABTS 011" ou "AM_002"'
          className="w-full rounded border border-slate-300 px-3 py-2 text-base disabled:bg-slate-100"
        />
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <label htmlFor="tipo" className="mb-1 block text-sm font-medium text-slate-700">
            Tipo
          </label>
          <select
            id="tipo"
            disabled={editingFromMf}
            value={form.tipo}
            onChange={(e) => setForm({ ...form, tipo: e.target.value as FormState['tipo'] })}
            className="w-full rounded border border-slate-300 px-3 py-2 text-base disabled:bg-slate-100"
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
            disabled={editingFromMf}
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value as StatusViatura })}
            className="w-full rounded border border-slate-300 px-3 py-2 text-base disabled:bg-slate-100"
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

      <fieldset className="grid grid-cols-1 gap-2 rounded border border-slate-200 p-2 sm:grid-cols-2">
        <legend className="px-1 text-xs font-medium text-slate-700">Características</legend>
        <label className="block">
          <span className="text-xs text-slate-600">KM atual</span>
          <input
            type="number"
            min={0}
            value={form.kmAtual}
            onChange={(e) => setForm({ ...form, kmAtual: e.target.value })}
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
          />
        </label>
        <label className="block">
          <span className="text-xs text-slate-600">Combustível</span>
          <select
            value={form.tipoCombustivel}
            onChange={(e) =>
              setForm({ ...form, tipoCombustivel: e.target.value as TipoCombustivel | '' })
            }
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
          >
            <option value="">—</option>
            {TIPOS_COMBUSTIVEL.map((t) => (
              <option key={t} value={t}>
                {TIPO_COMBUSTIVEL_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 sm:col-span-2">
          <input
            type="checkbox"
            checked={form.usaArla32}
            onChange={(e) => setForm({ ...form, usaArla32: e.target.checked })}
            className="h-5 w-5 rounded border-slate-300 text-cbmes-red focus:ring-cbmes-red"
          />
          <span className="text-sm text-slate-700">Utiliza ARLA32</span>
        </label>
        <label className="block">
          <span className="text-xs text-slate-600">Capacidade do tanque (litros)</span>
          <input
            type="number"
            min={0}
            value={form.capacidadeTanqueLitros}
            onChange={(e) => setForm({ ...form, capacidadeTanqueLitros: e.target.value })}
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
          />
        </label>
        <label className="block">
          <span className="text-xs text-slate-600">Estado do tanque (%) — Conferência</span>
          <input
            type="number"
            disabled
            placeholder="preenchido na Conferência (S6b)"
            className="mt-1 w-full rounded border border-slate-300 bg-slate-100 px-2 py-1.5"
          />
        </label>
        <label className="block">
          <span className="text-xs text-slate-600">Altura (m)</span>
          <input
            type="number"
            min={0}
            step={0.01}
            value={form.alturaMetros}
            onChange={(e) => setForm({ ...form, alturaMetros: e.target.value })}
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
          />
        </label>
        <label className="block">
          <span className="text-xs text-slate-600">Largura (m)</span>
          <input
            type="number"
            min={0}
            step={0.01}
            value={form.larguraMetros}
            onChange={(e) => setForm({ ...form, larguraMetros: e.target.value })}
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
          />
        </label>
      </fieldset>

      <fieldset className="rounded border border-slate-200 p-2">
        <legend className="px-1 text-xs font-medium text-slate-700">Militar responsável</legend>
        <MilitarSelect
          value={form.militarResponsavelNf || undefined}
          onChange={(nf, m) =>
            setForm({
              ...form,
              militarResponsavelNf: nf ?? '',
              militarResponsavelNome: m ? `${m.posto} ${m.nomeGuerra ?? m.nome.split(' ')[0]}` : '',
            })
          }
          placeholder="Digite NF ou nome (mín. 2 chars)"
        />
      </fieldset>

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
          onClick={onCancel}
          disabled={saving}
          className="flex-1 rounded-button border border-slate-300 bg-white py-2 text-base text-slate-700"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

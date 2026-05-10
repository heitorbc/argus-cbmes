import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Atestado, CreateAtestadoInput, Militar } from '@argus/shared-types';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { MilitarSelect } from '@/components/militar-select';

interface FormState {
  militarNf: string;
  militarRaw: string;
  dataInicio: string;
  dias: number;
  cid10: string;
  crmMedico: string;
  observacoes: string;
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const EMPTY_FORM: FormState = {
  militarNf: '',
  militarRaw: '',
  dataInicio: todayIso(),
  dias: 1,
  cid10: '',
  crmMedico: '',
  observacoes: '',
};

export function AtestadosPage() {
  const { user } = useAuth();
  const isAdmin = user?.papeis.includes('admin') ?? false;
  const isSarg = user?.papeis.includes('sargenteante') ?? false;
  const isFiscal = user?.papeis.includes('fiscal') ?? false;
  const podeCriar = isAdmin || isSarg || isFiscal;
  const podeEditar = isAdmin || isSarg;

  const [atestados, setAtestados] = useState<Atestado[]>([]);
  const [filtroMilitar, setFiltroMilitar] = useState<{ nf?: string; raw?: string }>({});
  const [filtroAno, setFiltroAno] = useState<number>(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [refreshSeed, setRefreshSeed] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .atestadosList({ militarNf: filtroMilitar.nf, ano: filtroAno })
      .then((list) => {
        if (cancelled) return;
        setAtestados(list);
        setError(null);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof ApiError ? e.message : 'Erro ao carregar atestados');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filtroMilitar.nf, filtroAno, refreshSeed]);

  const reload = () => setRefreshSeed((s) => s + 1);

  const startCreate = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setFormError(null);
    setShowForm(true);
  };

  const startEdit = async (a: Atestado) => {
    let militarRaw = `NF ${a.militarNf}`;
    try {
      const m = await api.efetivoFindByNf(a.militarNf);
      militarRaw = `${m.posto} ${m.nomeGuerra ?? m.nome.split(' ')[0]}`;
    } catch {
      // fallback
    }
    setForm({
      militarNf: a.militarNf,
      militarRaw,
      dataInicio: a.dataInicio,
      dias: a.dias,
      cid10: a.cid10,
      crmMedico: a.crmMedico,
      observacoes: a.observacoes ?? '',
    });
    setEditingId(a.id);
    setFormError(null);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.militarNf) {
      setFormError('Militar é obrigatório.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (editingId) {
        await api.atestadosUpdate(editingId, {
          dataInicio: form.dataInicio,
          dias: form.dias,
          cid10: form.cid10.trim(),
          crmMedico: form.crmMedico.trim(),
          observacoes: form.observacoes.trim() || undefined,
        });
      } else {
        const input: CreateAtestadoInput = {
          militarNf: form.militarNf,
          dataInicio: form.dataInicio,
          dias: form.dias,
          cid10: form.cid10.trim(),
          crmMedico: form.crmMedico.trim(),
          observacoes: form.observacoes.trim() || undefined,
        };
        await api.atestadosCreate(input);
      }
      setShowForm(false);
      setEditingId(null);
      reload();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (a: Atestado) => {
    if (!confirm(`Remover atestado de NF ${a.militarNf} (${a.cid10})?`)) return;
    try {
      await api.atestadosRemove(a.id);
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao remover');
    }
  };

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-cbmes-blue px-4 py-4 text-white">
        <Link to="/" className="text-sm opacity-90 hover:opacity-100">
          ← Início
        </Link>
        <h1 className="mt-1 text-lg font-bold">Atestados Médicos</h1>
        <p className="text-xs opacity-90">Sargenteação · Registro com CID-10 + CRM do médico</p>
      </header>

      <section className="mx-auto max-w-3xl p-4">
        <div className="rounded border border-slate-200 bg-white p-3 text-xs text-slate-700">
          <p>
            <strong>S6k:</strong> Atestados registrados aqui aparecem automaticamente na Prévia do
            dia conforme o período (dataInicio + dias) — seção "alterações de efetivo" da PD. Pode
            ser registrado em 3 lugares: este módulo, ajuste pré-turno da Prévia, ou durante o
            serviço.
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

        <div className="mt-3 grid grid-cols-1 gap-2 rounded border border-slate-200 bg-white p-3 sm:grid-cols-[1fr_auto]">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-slate-500">Filtro militar</p>
            <MilitarSelect
              value={filtroMilitar.nf}
              valueRaw={filtroMilitar.raw}
              onChange={(nf, m) =>
                setFiltroMilitar({
                  nf: nf ?? undefined,
                  raw: m ? `${m.posto} ${m.nomeGuerra ?? m.nome.split(' ')[0]}` : undefined,
                })
              }
              placeholder="Todos os militares"
            />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-slate-500">Ano</p>
            <input
              type="number"
              min={2020}
              max={2100}
              value={filtroAno}
              onChange={(e) => setFiltroAno(Number(e.target.value))}
              className="w-24 rounded border border-slate-300 px-2 py-2 text-sm"
            />
          </div>
        </div>

        {podeCriar && !showForm && (
          <button
            type="button"
            onClick={startCreate}
            className="mt-3 w-full rounded-button bg-cbmes-red py-2.5 text-base font-semibold text-white"
          >
            + Novo atestado
          </button>
        )}

        {showForm && podeCriar && (
          <form
            onSubmit={handleSubmit}
            className="mt-3 space-y-3 rounded border border-slate-300 bg-white p-4"
          >
            <h2 className="text-sm font-semibold text-slate-700">
              {editingId ? 'Editar atestado' : 'Novo atestado'}
            </h2>

            <label className="block">
              <span className="text-sm font-medium text-slate-700">
                Militar <span className="text-feedback-error">*</span>
              </span>
              <MilitarSelect
                value={form.militarNf || undefined}
                valueRaw={form.militarRaw || undefined}
                onChange={(nf, m: Militar | null) => {
                  setForm({
                    ...form,
                    militarNf: nf ?? '',
                    militarRaw: m ? `${m.posto} ${m.nomeGuerra ?? m.nome.split(' ')[0]}` : '',
                  });
                }}
                placeholder="Buscar militar (NF ou nome)"
              />
            </label>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Data início</span>
                <input
                  type="date"
                  value={form.dataInicio}
                  onChange={(e) => setForm({ ...form, dataInicio: e.target.value })}
                  required
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Dias</span>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={form.dias}
                  onChange={(e) => setForm({ ...form, dias: Number(e.target.value) })}
                  required
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm"
                />
              </label>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">
                  CID-10 <span className="text-feedback-error">*</span>
                </span>
                <input
                  type="text"
                  value={form.cid10}
                  onChange={(e) => setForm({ ...form, cid10: e.target.value })}
                  required
                  placeholder="Ex.: J11, S52.5"
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">
                  CRM médico <span className="text-feedback-error">*</span>
                </span>
                <input
                  type="text"
                  value={form.crmMedico}
                  onChange={(e) => setForm({ ...form, crmMedico: e.target.value })}
                  required
                  placeholder="Ex.: CRM-ES 12345"
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm"
                />
              </label>
            </div>

            <label className="block">
              <span className="text-sm font-medium text-slate-700">
                Observações <span className="text-[10px] text-slate-500">(opcional)</span>
              </span>
              <textarea
                rows={2}
                value={form.observacoes}
                onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm"
              />
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
                {saving ? 'Salvando…' : editingId ? 'Salvar alterações' : 'Criar atestado'}
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
          {!loading && atestados.length === 0 && (
            <p className="text-sm text-slate-500">Nenhum atestado no filtro atual.</p>
          )}
          {atestados.length > 0 && (
            <p className="text-xs text-slate-600">{atestados.length} atestado(s)</p>
          )}
          {atestados.map((a) => (
            <div key={a.id} className="rounded border border-slate-200 bg-white p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-cbmes-blue">NF {a.militarNf}</p>
                  <p className="mt-0.5 text-xs text-slate-700">
                    <span className="mr-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-rose-700">
                      {a.cid10}
                    </span>
                    CRM {a.crmMedico}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    {a.dataInicio} · <strong>{a.dias}</strong> dia(s)
                  </p>
                  {a.observacoes && (
                    <p className="mt-1 text-xs italic text-slate-500">{a.observacoes}</p>
                  )}
                </div>
                {podeEditar && (
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => void startEdit(a)}
                      className="rounded border border-cbmes-blue px-3 py-1 text-xs font-medium text-cbmes-blue hover:bg-cbmes-blue/10"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleRemove(a)}
                      className="rounded border border-feedback-error px-3 py-1 text-xs font-medium text-feedback-error hover:bg-feedback-error/10"
                    >
                      Remover
                    </button>
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

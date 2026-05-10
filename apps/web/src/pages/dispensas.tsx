import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  TIPO_DISPENSA,
  TIPO_DISPENSA_LABEL,
  type CreateDispensaInput,
  type Dispensa,
  type Militar,
  type TipoDispensa,
} from '@argus/shared-types';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { MilitarSelect } from '@/components/militar-select';

interface FormState {
  militarNf: string;
  militarRaw: string;
  tipo: TipoDispensa;
  dataInicio: string;
  dias: number;
  numeroEdocs: string;
  observacoes: string;
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const EMPTY_FORM: FormState = {
  militarNf: '',
  militarRaw: '',
  tipo: 'I_TAF',
  dataInicio: todayIso(),
  dias: 1,
  numeroEdocs: '',
  observacoes: '',
};

const TIPO_BADGE: Record<TipoDispensa, string> = {
  I_TAF: 'bg-emerald-500/15 text-emerald-800',
  II_EXAME: 'bg-sky-500/15 text-sky-800',
  III_INOVACAO: 'bg-violet-500/15 text-violet-800',
  IV_INSTRUCAO: 'bg-amber-500/15 text-amber-800',
  V_ANIVERSARIO: 'bg-pink-500/15 text-pink-800',
  VI_ASSIDUIDADE: 'bg-cbmes-blue/15 text-cbmes-blue',
  VII_MERITO: 'bg-cbmes-red/15 text-cbmes-red',
  VIII_DIVERSAS: 'bg-slate-500/15 text-slate-700',
};

export function DispensasPage() {
  const { user } = useAuth();
  const isAdmin = user?.papeis.includes('admin') ?? false;
  const isSarg = user?.papeis.includes('sargenteante') ?? false;
  const isFiscal = user?.papeis.includes('fiscal') ?? false;
  const podeCriar = isAdmin || isSarg || isFiscal;
  const podeEditar = isAdmin || isSarg;

  const [dispensas, setDispensas] = useState<Dispensa[]>([]);
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
      .dispensasList({ militarNf: filtroMilitar.nf, ano: filtroAno })
      .then((list) => {
        if (cancelled) return;
        setDispensas(list);
        setError(null);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof ApiError ? e.message : 'Erro ao carregar dispensas');
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

  const startEdit = async (d: Dispensa) => {
    let militarRaw = `NF ${d.militarNf}`;
    try {
      const m = await api.efetivoFindByNf(d.militarNf);
      militarRaw = `${m.posto} ${m.nomeGuerra ?? m.nome.split(' ')[0]}`;
    } catch {
      // ignore — usa fallback "NF xxx"
    }
    setForm({
      militarNf: d.militarNf,
      militarRaw,
      tipo: d.tipo,
      dataInicio: d.dataInicio,
      dias: d.dias,
      numeroEdocs: d.numeroEdocs ?? '',
      observacoes: d.observacoes ?? '',
    });
    setEditingId(d.id);
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
        await api.dispensasUpdate(editingId, {
          tipo: form.tipo,
          dataInicio: form.dataInicio,
          dias: form.dias,
          numeroEdocs: form.numeroEdocs.trim() || undefined,
          observacoes: form.observacoes.trim() || undefined,
        });
      } else {
        const input: CreateDispensaInput = {
          militarNf: form.militarNf,
          tipo: form.tipo,
          dataInicio: form.dataInicio,
          dias: form.dias,
          numeroEdocs: form.numeroEdocs.trim() || undefined,
          observacoes: form.observacoes.trim() || undefined,
        };
        await api.dispensasCreate(input);
      }
      setShowForm(false);
      setEditingId(null);
      await reload();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (d: Dispensa) => {
    if (!confirm(`Remover dispensa de NF ${d.militarNf} (${TIPO_DISPENSA_LABEL[d.tipo]})?`)) return;
    try {
      await api.dispensasRemove(d.id);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao remover');
    }
  };

  const totalNoFiltro = useMemo(() => dispensas.reduce((acc, d) => acc + d.dias, 0), [dispensas]);

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-cbmes-blue px-4 py-4 text-white">
        <Link to="/" className="text-sm opacity-90 hover:opacity-100">
          ← Início
        </Link>
        <h1 className="mt-1 text-lg font-bold">Dispensas</h1>
        <p className="text-xs opacity-90">
          Sargenteação · 8 tipos canônicos (I–VIII) com limites institucionais
        </p>
      </header>

      <section className="mx-auto max-w-3xl p-4">
        <div className="rounded border border-slate-200 bg-white p-3 text-xs text-slate-700">
          <p>
            <strong>S6j:</strong> Dispensas registradas aqui aparecem automaticamente na Prévia do
            dia conforme o período (`dataInicio` + `dias`). Os limites por tipo seguem a lista
            institucional do CBMES (TAF, Exame, Inovação, Instrução, Aniversário, Assiduidade,
            Mérito, Diversas).
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
            + Nova dispensa
          </button>
        )}

        {showForm && podeCriar && (
          <form
            onSubmit={handleSubmit}
            className="mt-3 space-y-3 rounded border border-slate-300 bg-white p-4"
          >
            <h2 className="text-sm font-semibold text-slate-700">
              {editingId ? 'Editar dispensa' : 'Nova dispensa'}
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

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr_1fr]">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Tipo</span>
                <select
                  value={form.tipo}
                  onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoDispensa })}
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm"
                >
                  {TIPO_DISPENSA.map((t) => (
                    <option key={t} value={t}>
                      {TIPO_DISPENSA_LABEL[t]}
                    </option>
                  ))}
                </select>
              </label>
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

            <label className="block">
              <span className="text-sm font-medium text-slate-700">
                Nº E-Docs <span className="text-[10px] text-slate-500">(opcional)</span>
              </span>
              <input
                type="text"
                value={form.numeroEdocs}
                onChange={(e) => setForm({ ...form, numeroEdocs: e.target.value })}
                placeholder="Ex.: 2026-XYZ-0001"
                className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm"
              />
            </label>

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
                {saving ? 'Salvando…' : editingId ? 'Salvar alterações' : 'Criar dispensa'}
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
          {!loading && dispensas.length === 0 && (
            <p className="text-sm text-slate-500">Nenhuma dispensa no filtro atual.</p>
          )}
          {dispensas.length > 0 && (
            <p className="text-xs text-slate-600">
              {dispensas.length} dispensas · {totalNoFiltro} dias totais
            </p>
          )}
          {dispensas.map((d) => (
            <div key={d.id} className="rounded border border-slate-200 bg-white p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-cbmes-blue">NF {d.militarNf}</p>
                  <p className="mt-0.5 text-xs text-slate-700">
                    <span
                      className={`mr-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${TIPO_BADGE[d.tipo]}`}
                    >
                      {d.tipo}
                    </span>
                    {TIPO_DISPENSA_LABEL[d.tipo]}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    {d.dataInicio} · <strong>{d.dias}</strong> dia(s)
                    {d.numeroEdocs && <> · E-Docs {d.numeroEdocs}</>}
                  </p>
                  {d.observacoes && (
                    <p className="mt-1 text-xs italic text-slate-500">{d.observacoes}</p>
                  )}
                </div>
                {podeEditar && (
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => void startEdit(d)}
                      className="rounded border border-cbmes-blue px-3 py-1 text-xs font-medium text-cbmes-blue hover:bg-cbmes-blue/10"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleRemove(d)}
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

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { CreateFeriasInput, Ferias, Militar } from '@argus/shared-types';
import { dataInicioDefault } from '@argus/shared-types';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { MilitarSelect } from '@/components/militar-select';

interface FormState {
  militarNf: string;
  militarRaw: string;
  mesAno: string;
  dataInicio: string;
  dias: number;
  observacoes: string;
}

function defaultMesAno(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const EMPTY_FORM: FormState = {
  militarNf: '',
  militarRaw: '',
  mesAno: defaultMesAno(),
  dataInicio: dataInicioDefault(defaultMesAno()),
  dias: 30,
  observacoes: '',
};

export function FeriasPage() {
  const { user } = useAuth();
  const isAdmin = user?.papeis.includes('admin') ?? false;
  const isSarg = user?.papeis.includes('sargenteante') ?? false;
  const podeEditar = isAdmin || isSarg;

  const [ferias, setFerias] = useState<Ferias[]>([]);
  const [filtroMilitar, setFiltroMilitar] = useState<{ nf?: string; raw?: string }>({});
  const [filtroAno, setFiltroAno] = useState<number>(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [refreshSeed, setRefreshSeed] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .feriasList({ militarNf: filtroMilitar.nf, ano: filtroAno })
      .then((list) => {
        if (cancelled) return;
        setFerias(list);
        setError(null);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof ApiError ? e.message : 'Erro ao carregar férias');
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
    setShowForm(true);
  };

  const startEdit = async (f: Ferias) => {
    let militarRaw = `NF ${f.militarNf}`;
    try {
      const m = await api.efetivoFindByNf(f.militarNf);
      militarRaw = `${m.posto} ${m.nomeGuerra ?? m.nome.split(' ')[0]}`;
    } catch {
      // ignore — fallback "NF xxx"
    }
    setForm({
      militarNf: f.militarNf,
      militarRaw,
      mesAno: f.mesAno,
      dataInicio: f.dataInicio,
      dias: f.dias,
      observacoes: f.observacoes ?? '',
    });
    setEditingId(f.id);
    setShowForm(true);
  };

  const handleMesAnoChange = (mesAno: string) => {
    // Quando muda o mês previsto, reseta dataInicio para dia 15 do novo mês.
    setForm((f) => ({ ...f, mesAno, dataInicio: dataInicioDefault(mesAno) }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.militarNf) {
      setError('Selecione um militar');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const input: CreateFeriasInput = {
        militarNf: form.militarNf,
        mesAno: form.mesAno,
        dataInicio: form.dataInicio,
        dias: form.dias,
        observacoes: form.observacoes || undefined,
      };
      if (editingId) {
        await api.feriasUpdate(editingId, {
          mesAno: input.mesAno,
          dataInicio: input.dataInicio,
          dias: input.dias,
          observacoes: input.observacoes,
        });
      } else {
        await api.feriasCreate(input);
      }
      setShowForm(false);
      setForm(EMPTY_FORM);
      setEditingId(null);
      reload();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erro ao salvar férias');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Apagar este registro de férias?')) return;
    try {
      await api.feriasRemove(id);
      reload();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erro ao apagar');
    }
  };

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-cbmes-blue px-4 py-4 text-white">
        <Link to="/" className="text-sm opacity-90 hover:opacity-100">
          ← Home
        </Link>
        <h1 className="mt-1 text-lg font-bold">🏖️ Férias</h1>
        <p className="text-xs opacity-90">Cadastro de férias dos militares (Sargenteação)</p>
      </header>

      <section className="mx-auto max-w-3xl p-4">
        <div className="rounded border border-slate-200 bg-white p-3 text-xs text-slate-600">
          <strong>Item 4:</strong> O militar tem direito a 30 dias de férias por ano. Por padrão
          começam no dia 15 do mês previsto, mas o Sargenteante pode ajustar tanto a data de início
          quanto o número de dias. Cada militar pode ter no máximo 1 registro por mês.
        </div>

        {error && (
          <div className="mt-3 rounded border border-feedback-error/30 bg-feedback-error/10 p-3 text-sm text-feedback-error">
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

        {podeEditar && !showForm && (
          <button
            type="button"
            onClick={startCreate}
            className="mt-3 w-full rounded-button bg-cbmes-red py-2.5 text-base font-semibold text-white"
          >
            + Novas férias
          </button>
        )}

        {showForm && podeEditar && (
          <form
            onSubmit={handleSubmit}
            className="mt-3 space-y-3 rounded border border-slate-300 bg-white p-4"
          >
            <h2 className="text-sm font-semibold text-slate-700">
              {editingId ? 'Editar férias' : 'Novas férias'}
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

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Mês previsto</span>
                <input
                  type="month"
                  value={form.mesAno}
                  onChange={(e) => handleMesAnoChange(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm"
                  required
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Data início</span>
                <input
                  type="date"
                  value={form.dataInicio}
                  onChange={(e) => setForm({ ...form, dataInicio: e.target.value })}
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm"
                  required
                />
                <span className="text-[10px] text-slate-500">Default: dia 15 do mês</span>
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Dias</span>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={form.dias}
                  onChange={(e) => setForm({ ...form, dias: Number(e.target.value) })}
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm"
                  required
                />
              </label>
            </div>

            <label className="block">
              <span className="text-sm font-medium text-slate-700">Observações</span>
              <textarea
                rows={2}
                value={form.observacoes}
                onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm"
              />
            </label>

            <div className="flex gap-2">
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
                  setEditingId(null);
                  setForm(EMPTY_FORM);
                }}
                className="flex-1 rounded-button border border-slate-300 bg-white py-2 text-center text-base text-slate-700"
              >
                Cancelar
              </button>
            </div>
          </form>
        )}

        <ul className="mt-4 space-y-2">
          {loading && <li className="text-sm text-slate-500">Carregando…</li>}
          {!loading && ferias.length === 0 && (
            <li className="rounded border border-dashed border-slate-300 bg-white p-4 text-center text-sm text-slate-500">
              Nenhum registro de férias para o filtro atual.
            </li>
          )}
          {ferias.map((f) => (
            <li
              key={f.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 bg-white p-3"
            >
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  NF {f.militarNf} · {f.mesAno}
                </p>
                <p className="text-xs text-slate-600">
                  Início: {f.dataInicio} · {f.dias} dias
                  {f.observacoes ? ` · ${f.observacoes}` : ''}
                </p>
              </div>
              {podeEditar && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void startEdit(f)}
                    className="rounded border border-cbmes-blue px-2 py-1 text-xs text-cbmes-blue hover:bg-cbmes-blue/10"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(f.id)}
                    className="rounded border border-feedback-error px-2 py-1 text-xs text-feedback-error hover:bg-feedback-error/10"
                  >
                    Apagar
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

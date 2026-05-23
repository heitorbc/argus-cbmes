import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Atestado, CreateAtestadoInput } from '@argus/shared-types';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { MilitarSelect } from '@/components/militar-select';
import { DataTable, type ColumnDef } from '@/components/desktop/DataTable';
import { FilterSidebar, FilterGroup } from '@/components/desktop/FilterSidebar';
import { SlideOverPanel } from '@/components/desktop/SlideOverPanel';
import { useKeyboardShortcut } from '@/components/desktop/KeyboardShortcuts';

/**
 * S2.10.12d — Atestados WEB.
 *
 * Mesmo pattern do Dispensas WEB (FilterSidebar + DataTable + SlideOverPanel),
 * adaptado para os campos específicos (CID-10, CRM médico).
 */
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

export function DesktopAtestadosPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = user?.papeis.includes('admin') ?? false;
  const isSarg = user?.papeis.includes('sargenteante') ?? false;
  const isFiscal = user?.papeis.includes('fiscal') ?? false;
  const podeCriar = isAdmin || isSarg || isFiscal;
  const podeEditar = isAdmin || isSarg;

  const [filtroMilitar, setFiltroMilitar] = useState<{ nf?: string; raw?: string }>({});
  const [filtroAno, setFiltroAno] = useState<number>(new Date().getFullYear());
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    data: atestados = [],
    isLoading: loading,
    error: queryError,
  } = useQuery({
    queryKey: ['atestados', filtroMilitar.nf ?? '', filtroAno],
    queryFn: () => api.atestadosList({ militarNf: filtroMilitar.nf, ano: filtroAno }),
    staleTime: 5 * 60 * 1000,
  });
  const error = queryError
    ? queryError instanceof ApiError
      ? queryError.message
      : 'Erro ao carregar atestados'
    : null;

  const activeFilters = (filtroMilitar.nf ? 1 : 0) + 1; // ano sempre conta

  const clearFilters = () => {
    setFiltroMilitar({});
    setFiltroAno(new Date().getFullYear());
  };

  const reload = () => queryClient.invalidateQueries({ queryKey: ['atestados'] });

  const startCreate = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setFormError(null);
    setPanelOpen(true);
  };

  const startEdit = (a: Atestado) => {
    setForm({
      militarNf: a.militarNf,
      militarRaw: '', // Atestado não armazena
      dataInicio: a.dataInicio,
      dias: a.dias,
      cid10: a.cid10,
      crmMedico: a.crmMedico,
      observacoes: a.observacoes ?? '',
    });
    setEditingId(a.id);
    setFormError(null);
    setPanelOpen(true);
  };

  const handleSave = async () => {
    if (
      !form.militarNf ||
      !form.dataInicio ||
      !form.dias ||
      form.dias < 1 ||
      !form.cid10.trim() ||
      !form.crmMedico.trim()
    ) {
      setFormError('Preencha militar, data início, dias (≥1), CID-10 e CRM médico.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const payload: CreateAtestadoInput = {
        militarNf: form.militarNf,
        dataInicio: form.dataInicio,
        dias: form.dias,
        cid10: form.cid10.trim(),
        crmMedico: form.crmMedico.trim(),
        observacoes: form.observacoes || undefined,
      };
      if (editingId) {
        await api.atestadosUpdate(editingId, payload);
      } else {
        await api.atestadosCreate(payload);
      }
      setPanelOpen(false);
      reload();
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'Erro ao salvar atestado');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!editingId) return;
    if (!window.confirm('Remover este atestado?')) return;
    setSaving(true);
    try {
      await api.atestadosRemove(editingId);
      setPanelOpen(false);
      reload();
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'Erro ao remover');
    } finally {
      setSaving(false);
    }
  };

  useKeyboardShortcut('n', () => {
    if (podeCriar && !panelOpen) startCreate();
  });

  const columns: ColumnDef<Atestado>[] = [
    {
      key: 'militar',
      label: 'Militar',
      render: (a) => <span className="font-medium text-slate-800">NF {a.militarNf}</span>,
      sortValue: (a) => a.militarNf,
    },
    {
      key: 'nf',
      label: 'NF',
      width: '90px',
      render: (a) => <span className="text-xs text-slate-500">{a.militarNf}</span>,
      sortValue: (a) => a.militarNf,
    },
    {
      key: 'dataInicio',
      label: 'Início',
      width: '110px',
      render: (a) => formatBR(a.dataInicio),
      sortValue: (a) => a.dataInicio,
    },
    {
      key: 'dias',
      label: 'Dias',
      width: '60px',
      align: 'right',
      render: (a) => <strong className="text-slate-900">{a.dias}</strong>,
      sortValue: (a) => a.dias,
    },
    {
      key: 'fim',
      label: 'Fim',
      width: '110px',
      render: (a) => formatBR(addDays(a.dataInicio, a.dias - 1)),
      sortValue: (a) => addDays(a.dataInicio, a.dias - 1),
    },
    {
      key: 'cid',
      label: 'CID-10',
      width: '100px',
      render: (a) => (
        <code className="rounded bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-800">
          {a.cid10}
        </code>
      ),
      sortValue: (a) => a.cid10,
    },
    {
      key: 'crm',
      label: 'CRM Médico',
      width: '130px',
      render: (a) => <span className="text-xs text-slate-600">{a.crmMedico}</span>,
    },
    {
      key: 'obs',
      label: 'Observações',
      render: (a) => (
        <span className="line-clamp-1 text-xs text-slate-600" title={a.observacoes ?? undefined}>
          {a.observacoes ?? '—'}
        </span>
      ),
    },
  ];

  return (
    <div className="flex h-full">
      <FilterSidebar
        title="Filtros"
        activeCount={activeFilters > 1 ? activeFilters : 0}
        onClear={clearFilters}
      >
        <FilterGroup label="Militar">
          <MilitarSelect
            value={filtroMilitar.nf ?? ''}
            valueRaw={filtroMilitar.raw ?? ''}
            onChange={(nf, m) =>
              setFiltroMilitar({
                nf: nf ?? undefined,
                raw: m ? formatMil(m) : undefined,
              })
            }
            placeholder="Buscar militar…"
          />
        </FilterGroup>
        <FilterGroup label="Ano">
          <select
            value={filtroAno}
            onChange={(e) => setFiltroAno(Number(e.target.value))}
            className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
          >
            {[0, -1, -2, -3].map((delta) => {
              const ano = new Date().getFullYear() + delta;
              return (
                <option key={ano} value={ano}>
                  {ano}
                </option>
              );
            })}
          </select>
        </FilterGroup>
      </FilterSidebar>

      <main className="flex flex-1 flex-col overflow-hidden">
        <header className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-6 py-3">
          <div>
            <h1 className="text-xl font-bold text-cbmes-blue">🩺 Atestados</h1>
            <p className="text-xs text-slate-500">
              {atestados.length} {atestados.length === 1 ? 'atestado' : 'atestados'} ·
              <span className="ml-1 opacity-70">
                atalho: <kbd className="rounded bg-slate-100 px-1 text-[10px]">n</kbd> nova
              </span>
            </p>
          </div>
          {podeCriar && (
            <button
              type="button"
              onClick={startCreate}
              className="rounded-button bg-cbmes-blue px-4 py-2 text-sm font-semibold text-white hover:bg-cbmes-blue-light"
            >
              + Novo atestado
            </button>
          )}
        </header>

        {error && (
          <div className="border-b border-feedback-error/30 bg-feedback-error/10 px-6 py-3 text-sm text-feedback-error">
            {error}
          </div>
        )}

        <div className="flex-1 overflow-auto p-6">
          <DataTable
            columns={columns}
            data={atestados}
            rowKey={(a) => a.id}
            loading={loading}
            onRowClick={podeEditar ? startEdit : undefined}
            emptyState={
              <>
                Nenhum atestado encontrado.{' '}
                {podeCriar && (
                  <button onClick={startCreate} className="font-medium text-cbmes-blue underline">
                    Cadastrar
                  </button>
                )}
              </>
            }
          />
        </div>
      </main>

      <SlideOverPanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        title={editingId ? 'Editar atestado' : 'Novo atestado'}
        footer={
          <>
            {editingId && podeEditar && (
              <button
                type="button"
                onClick={() => void handleRemove()}
                disabled={saving}
                className="mr-auto rounded-button border border-feedback-error/30 px-3 py-1.5 text-sm font-medium text-feedback-error hover:bg-feedback-error/5"
              >
                Remover
              </button>
            )}
            <button
              type="button"
              onClick={() => setPanelOpen(false)}
              className="rounded-button border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="rounded-button bg-cbmes-blue px-4 py-1.5 text-sm font-semibold text-white hover:bg-cbmes-blue-light disabled:opacity-50"
            >
              {saving ? 'Salvando…' : editingId ? 'Salvar' : 'Criar'}
            </button>
          </>
        }
      >
        <AtestadoForm
          form={form}
          setForm={setForm}
          formError={formError}
          locked={!podeEditar && !!editingId}
        />
      </SlideOverPanel>
    </div>
  );
}

// ── Form ───────────────────────────────────────────────────────────

interface AtestadoFormProps {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  formError: string | null;
  locked?: boolean;
}

function AtestadoForm({ form, setForm, formError, locked }: AtestadoFormProps) {
  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="space-y-4">
      {formError && (
        <div className="rounded border border-feedback-error/30 bg-feedback-error/10 p-3 text-sm text-feedback-error">
          {formError}
        </div>
      )}
      <Field label="Militar*">
        <MilitarSelect
          value={form.militarNf}
          valueRaw={form.militarRaw}
          onChange={(nf, m) =>
            setForm((prev) => ({
              ...prev,
              militarNf: nf ?? '',
              militarRaw: m ? formatMil(m) : '',
            }))
          }
          disabled={locked}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Data início*">
          <input
            type="date"
            value={form.dataInicio}
            onChange={(e) => update('dataInicio', e.target.value)}
            disabled={locked}
            className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Dias*">
          <input
            type="number"
            min={1}
            value={form.dias}
            onChange={(e) => update('dias', Number(e.target.value))}
            disabled={locked}
            className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="CID-10*">
          <input
            type="text"
            value={form.cid10}
            onChange={(e) => update('cid10', e.target.value.toUpperCase())}
            disabled={locked}
            placeholder="ex.: J11"
            className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm font-mono"
          />
        </Field>
        <Field label="CRM Médico*">
          <input
            type="text"
            value={form.crmMedico}
            onChange={(e) => update('crmMedico', e.target.value)}
            disabled={locked}
            placeholder="ex.: CRM-ES 12345"
            className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
          />
        </Field>
      </div>
      <Field label="Observações">
        <textarea
          value={form.observacoes}
          onChange={(e) => update('observacoes', e.target.value)}
          disabled={locked}
          rows={4}
          className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
        />
      </Field>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-600">
        {label}
      </span>
      {children}
    </label>
  );
}

// ── Utils ──────────────────────────────────────────────────────────

function formatBR(iso: string): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatMil(m: { posto: string; nomeGuerra?: string; nome: string }): string {
  return `${m.posto} ${m.nomeGuerra ?? m.nome.split(' ')[0] ?? m.nome}`;
}

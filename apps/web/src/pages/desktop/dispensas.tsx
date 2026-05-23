import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  TIPO_DISPENSA,
  TIPO_DISPENSA_LABEL,
  type CreateDispensaInput,
  type Dispensa,
  type TipoDispensa,
} from '@argus/shared-types';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { MilitarSelect } from '@/components/militar-select';
import { DataTable, type ColumnDef } from '@/components/desktop/DataTable';
import { FilterSidebar, FilterGroup } from '@/components/desktop/FilterSidebar';
import { SlideOverPanel } from '@/components/desktop/SlideOverPanel';
import { useKeyboardShortcut } from '@/components/desktop/KeyboardShortcuts';

/**
 * S2.10.12d — Dispensas WEB.
 *
 * Layout:
 *   - FilterSidebar (288px): typeahead de militar + ano + tipo
 *   - Main: tabela larga (8 cols) com sort por coluna
 *   - SlideOverPanel: form de create/edit (em vez de modal central)
 *
 * Atalhos teclado:
 *   - `n` foca o botão "Nova dispensa" (se permitido)
 *   - `Esc` fecha o panel (gerenciado pelo SlideOverPanel)
 */
interface FormState {
  militarNf: string;
  militarRaw: string;
  tipo: TipoDispensa;
  dataInicio: string;
  dias: number;
  numeroEdocs: string;
  observacoes: string;
  minuta: string;
  equipe: string;
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
  minuta: '',
  equipe: '',
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
  IX_OUTRAS: 'bg-stone-500/15 text-stone-700',
};

export function DesktopDispensasPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = user?.papeis.includes('admin') ?? false;
  const isSarg = user?.papeis.includes('sargenteante') ?? false;
  const isFiscal = user?.papeis.includes('fiscal') ?? false;
  const podeCriar = isAdmin || isSarg || isFiscal;
  const podeEditar = isAdmin || isSarg;

  const [filtroMilitar, setFiltroMilitar] = useState<{ nf?: string; raw?: string }>({});
  const [filtroAno, setFiltroAno] = useState<number>(new Date().getFullYear());
  const [filtroTipo, setFiltroTipo] = useState<TipoDispensa | 'TODOS'>('TODOS');
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const {
    data: dispensas = [],
    isLoading: loading,
    error: queryError,
  } = useQuery({
    queryKey: ['dispensas', filtroMilitar.nf ?? '', filtroAno],
    queryFn: () => api.dispensasList({ militarNf: filtroMilitar.nf, ano: filtroAno }),
    staleTime: 5 * 60 * 1000,
  });
  const error = queryError
    ? queryError instanceof ApiError
      ? queryError.message
      : 'Erro ao carregar dispensas'
    : null;

  // Filtro por tipo (client-side)
  const filtradas = useMemo(() => {
    if (filtroTipo === 'TODOS') return dispensas;
    return dispensas.filter((d) => d.tipo === filtroTipo);
  }, [dispensas, filtroTipo]);

  const activeFilters = (filtroMilitar.nf ? 1 : 0) + (filtroTipo !== 'TODOS' ? 1 : 0) + 1; // ano sempre conta

  const clearFilters = () => {
    setFiltroMilitar({});
    setFiltroAno(new Date().getFullYear());
    setFiltroTipo('TODOS');
  };

  const reload = () => queryClient.invalidateQueries({ queryKey: ['dispensas'] });

  const startCreate = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setFormError(null);
    setPanelOpen(true);
  };

  const startEdit = (d: Dispensa) => {
    setForm({
      militarNf: d.militarNf,
      militarRaw: '', // Dispensa não armazena; MilitarSelect resolve por NF
      tipo: d.tipo,
      dataInicio: d.dataInicio,
      dias: d.dias,
      numeroEdocs: d.numeroEdocs ?? '',
      observacoes: d.observacoes ?? '',
      minuta: d.minuta ?? '',
      equipe: d.equipe ?? '',
    });
    setEditingId(d.id);
    setFormError(null);
    setPanelOpen(true);
  };

  const handleSave = async () => {
    if (!form.militarNf || !form.dataInicio || !form.dias || form.dias < 1) {
      setFormError('Preencha militar, data início e quantidade de dias (≥1).');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const payload: CreateDispensaInput = {
        militarNf: form.militarNf,
        tipo: form.tipo,
        dataInicio: form.dataInicio,
        dias: form.dias,
        numeroEdocs: form.numeroEdocs || undefined,
        observacoes: form.observacoes || undefined,
        minuta: form.minuta || undefined,
        equipe: form.equipe || undefined,
      };
      if (editingId) {
        await api.dispensasUpdate(editingId, payload);
      } else {
        await api.dispensasCreate(payload);
      }
      setPanelOpen(false);
      reload();
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'Erro ao salvar dispensa');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!editingId) return;
    if (!window.confirm('Remover esta dispensa?')) return;
    setSaving(true);
    try {
      await api.dispensasRemove(editingId);
      setPanelOpen(false);
      reload();
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'Erro ao remover');
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const r = await api.dispensasSyncPlanilha();
      setSyncMsg(`Sync OK: ${r.created} criadas, ${r.updated} atualizadas, ${r.skipped} ignoradas`);
      reload();
    } catch (e) {
      setSyncMsg(e instanceof ApiError ? e.message : 'Erro no sync');
    } finally {
      setSyncing(false);
    }
  };

  // Atalho "n" foca o botão Nova
  useKeyboardShortcut('n', () => {
    if (podeCriar && !panelOpen) startCreate();
  });

  const columns: ColumnDef<Dispensa>[] = [
    {
      key: 'tipo',
      label: 'Tipo',
      width: '140px',
      render: (d) => (
        <span
          className={`inline-block rounded px-2 py-0.5 text-xs font-bold ${TIPO_BADGE[d.tipo]}`}
        >
          {TIPO_DISPENSA_LABEL[d.tipo]}
        </span>
      ),
      sortValue: (d) => TIPO_DISPENSA_LABEL[d.tipo],
    },
    {
      key: 'militar',
      label: 'Militar',
      render: (d) => <span className="font-medium text-slate-800">NF {d.militarNf}</span>,
      sortValue: (d) => d.militarNf,
    },
    {
      key: 'nf',
      label: 'NF',
      width: '90px',
      render: (d) => <span className="text-xs text-slate-500">{d.militarNf}</span>,
      sortValue: (d) => d.militarNf,
    },
    {
      key: 'dataInicio',
      label: 'Início',
      width: '110px',
      render: (d) => formatBR(d.dataInicio),
      sortValue: (d) => d.dataInicio,
    },
    {
      key: 'dias',
      label: 'Dias',
      width: '60px',
      align: 'right',
      render: (d) => <strong className="text-slate-900">{d.dias}</strong>,
      sortValue: (d) => d.dias,
    },
    {
      key: 'fim',
      label: 'Fim',
      width: '110px',
      render: (d) => formatBR(addDays(d.dataInicio, d.dias - 1)),
      sortValue: (d) => addDays(d.dataInicio, d.dias - 1),
    },
    {
      key: 'edocs',
      label: 'e-Docs',
      width: '140px',
      render: (d) => <code className="text-xs text-slate-600">{d.numeroEdocs ?? '—'}</code>,
    },
    {
      key: 'obs',
      label: 'Observações',
      render: (d) => (
        <span className="line-clamp-1 text-xs text-slate-600" title={d.observacoes ?? undefined}>
          {d.observacoes ?? '—'}
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
        <FilterGroup label="Tipo">
          <select
            value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value as TipoDispensa | 'TODOS')}
            className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
          >
            <option value="TODOS">Todos os tipos</option>
            {TIPO_DISPENSA.map((t) => (
              <option key={t} value={t}>
                {TIPO_DISPENSA_LABEL[t]}
              </option>
            ))}
          </select>
        </FilterGroup>
      </FilterSidebar>

      <main className="flex flex-1 flex-col overflow-hidden">
        <header className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-6 py-3">
          <div>
            <h1 className="text-xl font-bold text-cbmes-blue">🏥 Dispensas</h1>
            <p className="text-xs text-slate-500">
              {filtradas.length} {filtradas.length === 1 ? 'dispensa' : 'dispensas'} ·
              <span className="ml-1 opacity-70">
                atalho: pressione <kbd className="rounded bg-slate-100 px-1 text-[10px]">n</kbd>{' '}
                para nova
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            {(isAdmin || isSarg) && (
              <button
                type="button"
                onClick={() => void handleSync()}
                disabled={syncing}
                className="rounded-button border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {syncing ? '⟳ Sincronizando…' : '🔄 Sincronizar'}
              </button>
            )}
            {podeCriar && (
              <button
                type="button"
                onClick={startCreate}
                className="rounded-button bg-cbmes-blue px-4 py-2 text-sm font-semibold text-white hover:bg-cbmes-blue-light"
              >
                + Nova dispensa
              </button>
            )}
          </div>
        </header>

        {syncMsg && (
          <div className="border-b border-slate-200 bg-slate-50 px-6 py-2 text-xs text-slate-700">
            {syncMsg}
          </div>
        )}
        {error && (
          <div className="border-b border-feedback-error/30 bg-feedback-error/10 px-6 py-3 text-sm text-feedback-error">
            {error}
          </div>
        )}

        <div className="flex-1 overflow-auto p-6">
          <DataTable
            columns={columns}
            data={filtradas}
            rowKey={(d) => d.id}
            loading={loading}
            onRowClick={podeEditar ? startEdit : undefined}
            emptyState={
              <>
                Nenhuma dispensa encontrada com esses filtros.{' '}
                {podeCriar && (
                  <button onClick={startCreate} className="font-medium text-cbmes-blue underline">
                    Cadastrar nova
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
        title={editingId ? 'Editar dispensa' : 'Nova dispensa'}
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
        <DispensaForm
          form={form}
          setForm={setForm}
          formError={formError}
          locked={!podeEditar && !!editingId}
        />
      </SlideOverPanel>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────

interface DispensaFormProps {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  formError: string | null;
  locked?: boolean;
}

function DispensaForm({ form, setForm, formError, locked }: DispensaFormProps) {
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
      <Field label="Tipo*">
        <select
          value={form.tipo}
          onChange={(e) => update('tipo', e.target.value as TipoDispensa)}
          disabled={locked}
          className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          {TIPO_DISPENSA.map((t) => (
            <option key={t} value={t}>
              {TIPO_DISPENSA_LABEL[t]}
            </option>
          ))}
        </select>
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
      <Field label="Número e-Docs">
        <input
          type="text"
          value={form.numeroEdocs}
          onChange={(e) => update('numeroEdocs', e.target.value)}
          disabled={locked}
          placeholder="ex.: 2026-1JKM2W"
          className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
        />
      </Field>
      <Field label="Equipe (opcional)">
        <input
          type="text"
          value={form.equipe}
          onChange={(e) => update('equipe', e.target.value)}
          disabled={locked}
          placeholder="A / B / C / D"
          className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
        />
      </Field>
      <Field label="Observações">
        <textarea
          value={form.observacoes}
          onChange={(e) => update('observacoes', e.target.value)}
          disabled={locked}
          rows={3}
          className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
        />
      </Field>
      <Field label="Minuta">
        <textarea
          value={form.minuta}
          onChange={(e) => update('minuta', e.target.value)}
          disabled={locked}
          rows={2}
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

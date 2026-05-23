import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateNotaServicoInput, NotaServico } from '@argus/shared-types';
import { ApiError, api, type NotaServicoPreviewPdfResponse } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { MilitarSelect } from '@/components/militar-select';
import { DataTable, type ColumnDef } from '@/components/desktop/DataTable';
import { FilterSidebar, FilterGroup } from '@/components/desktop/FilterSidebar';
import { SlideOverPanel } from '@/components/desktop/SlideOverPanel';
import { useKeyboardShortcut } from '@/components/desktop/KeyboardShortcuts';

/**
 * S2.10.12e — Notas de Serviço WEB.
 *
 * Pattern padronizado + uma feature extra: **drop-zone PDF** proeminente
 * no topo do form para o parser pré-preencher campos automaticamente
 * (S6m). Em mobile o botão "Importar PDF" fica escondido — em WEB ele é
 * destaque visual (drag-and-drop ou click pra escolher).
 */
interface FormState {
  codigo: string;
  descricao: string;
  data: string;
  horaInicio: string;
  horaFim: string;
  viaturaPrefixo: string;
  militaresNfs: string[];
  observacoes: string;
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const EMPTY_FORM: FormState = {
  codigo: '',
  descricao: '',
  data: todayIso(),
  horaInicio: '08:00',
  horaFim: '12:00',
  viaturaPrefixo: '',
  militaresNfs: [],
  observacoes: '',
};

export function DesktopNotasServicoPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = user?.papeis.includes('admin') ?? false;
  const isSarg = user?.papeis.includes('sargenteante') ?? false;
  const isFiscal = user?.papeis.includes('fiscal') ?? false;
  const podeCriar = isAdmin || isSarg || isFiscal;
  const podeEditar = isAdmin || isSarg;

  const [filtroData, setFiltroData] = useState<string>('');
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfMsg, setPdfMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    data: notas = [],
    isLoading: loading,
    error: queryError,
  } = useQuery({
    queryKey: ['notas-servico', filtroData],
    queryFn: () => api.notasServicoList({ data: filtroData || undefined }),
    staleTime: 5 * 60 * 1000,
  });
  const error = queryError
    ? queryError instanceof ApiError
      ? queryError.message
      : 'Erro ao carregar notas'
    : null;

  const activeFilters = filtroData ? 1 : 0;
  const clearFilters = () => setFiltroData('');
  const reload = () => queryClient.invalidateQueries({ queryKey: ['notas-servico'] });

  const startCreate = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setFormError(null);
    setPdfMsg(null);
    setPanelOpen(true);
  };

  const startEdit = (n: NotaServico) => {
    setForm({
      codigo: n.codigo,
      descricao: n.descricao,
      data: n.data,
      horaInicio: n.horaInicio,
      horaFim: n.horaFim,
      viaturaPrefixo: n.viaturaPrefixo ?? '',
      militaresNfs: [...n.militaresNfs],
      observacoes: n.observacoes ?? '',
    });
    setEditingId(n.id);
    setFormError(null);
    setPdfMsg(null);
    setPanelOpen(true);
  };

  const handleSave = async () => {
    if (
      !form.codigo.trim() ||
      !form.descricao.trim() ||
      !form.data ||
      !form.horaInicio ||
      !form.horaFim ||
      form.militaresNfs.length === 0
    ) {
      setFormError('Preencha código, descrição, data, horários e pelo menos 1 militar.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const payload: CreateNotaServicoInput = {
        codigo: form.codigo.trim(),
        descricao: form.descricao.trim(),
        data: form.data,
        horaInicio: form.horaInicio,
        horaFim: form.horaFim,
        viaturaPrefixo: form.viaturaPrefixo.trim() || undefined,
        militaresNfs: form.militaresNfs,
        observacoes: form.observacoes.trim() || undefined,
      };
      if (editingId) {
        await api.notasServicoUpdate(editingId, payload);
      } else {
        await api.notasServicoCreate(payload);
      }
      setPanelOpen(false);
      reload();
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!editingId) return;
    if (!window.confirm('Remover esta nota de serviço?')) return;
    setSaving(true);
    try {
      await api.notasServicoRemove(editingId);
      setPanelOpen(false);
      reload();
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'Erro ao remover');
    } finally {
      setSaving(false);
    }
  };

  const handlePdfFile = async (file: File | null) => {
    if (!file) return;
    setPdfLoading(true);
    setPdfMsg(null);
    try {
      const preview: NotaServicoPreviewPdfResponse = await api.notasServicoPreviewPdf(file);
      // Pré-preenche o form com sugestões do parser (S6m)
      setForm((prev) => ({
        ...prev,
        codigo: preview.codigoSugerido ?? prev.codigo,
        descricao: preview.descricaoSugerida ?? prev.descricao,
        data: preview.dataSugerida ?? prev.data,
        horaInicio: preview.horaInicioSugerida ?? prev.horaInicio,
        horaFim: preview.horaFimSugerida ?? prev.horaFim,
        viaturaPrefixo: preview.viaturaSugerida ?? prev.viaturaPrefixo,
        militaresNfs: preview.militaresNfs.length > 0 ? preview.militaresNfs : prev.militaresNfs,
      }));
      const avisos = preview.avisos.length > 0 ? ` · ${preview.avisos.length} avisos` : '';
      setPdfMsg(`Sugestões aplicadas (${preview.militaresNfs.length} militares)${avisos}.`);
    } catch (e) {
      setPdfMsg(e instanceof ApiError ? e.message : 'Erro ao processar PDF');
    } finally {
      setPdfLoading(false);
    }
  };

  useKeyboardShortcut('n', () => {
    if (podeCriar && !panelOpen) startCreate();
  });

  const removeMilitar = (nf: string) =>
    setForm((prev) => ({
      ...prev,
      militaresNfs: prev.militaresNfs.filter((x) => x !== nf),
    }));

  const addMilitar = (nf: string) => {
    if (!nf || form.militaresNfs.includes(nf)) return;
    setForm((prev) => ({ ...prev, militaresNfs: [...prev.militaresNfs, nf] }));
  };

  const columns: ColumnDef<NotaServico>[] = [
    {
      key: 'codigo',
      label: 'Código',
      width: '120px',
      render: (n) => (
        <code className="rounded bg-cbmes-blue/10 px-2 py-0.5 text-xs font-bold text-cbmes-blue">
          {n.codigo}
        </code>
      ),
      sortValue: (n) => n.codigo,
    },
    {
      key: 'descricao',
      label: 'Descrição',
      render: (n) => <span className="line-clamp-1 font-medium text-slate-800">{n.descricao}</span>,
      sortValue: (n) => n.descricao,
    },
    {
      key: 'data',
      label: 'Data',
      width: '110px',
      render: (n) => formatBR(n.data),
      sortValue: (n) => n.data,
    },
    {
      key: 'horario',
      label: 'Horário',
      width: '110px',
      render: (n) => (
        <code className="text-xs">
          {n.horaInicio}–{n.horaFim}
        </code>
      ),
    },
    {
      key: 'viatura',
      label: 'Viatura',
      width: '110px',
      render: (n) => <span className="text-xs text-slate-600">{n.viaturaPrefixo ?? '—'}</span>,
    },
    {
      key: 'militares',
      label: 'Militares',
      width: '90px',
      align: 'center',
      render: (n) => (
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
          {n.militaresNfs.length}
        </span>
      ),
      sortValue: (n) => n.militaresNfs.length,
    },
    {
      key: 'obs',
      label: 'Observações',
      render: (n) => (
        <span className="line-clamp-1 text-xs text-slate-600" title={n.observacoes ?? undefined}>
          {n.observacoes ?? '—'}
        </span>
      ),
    },
  ];

  return (
    <div className="flex h-full">
      <FilterSidebar title="Filtros" activeCount={activeFilters} onClear={clearFilters}>
        <FilterGroup label="Data">
          <input
            type="date"
            value={filtroData}
            onChange={(e) => setFiltroData(e.target.value)}
            className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm"
          />
          <p className="mt-1 text-[10px] text-slate-500">Vazio = todas as datas</p>
        </FilterGroup>
      </FilterSidebar>

      <main className="flex flex-1 flex-col overflow-hidden">
        <header className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-6 py-3">
          <div>
            <h1 className="text-xl font-bold text-cbmes-blue">📑 Notas de Serviço</h1>
            <p className="text-xs text-slate-500">
              {notas.length} {notas.length === 1 ? 'nota' : 'notas'} ·
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
              + Nova NS
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
            data={notas}
            rowKey={(n) => n.id}
            loading={loading}
            onRowClick={podeEditar ? startEdit : undefined}
            emptyState={
              <>
                Nenhuma nota encontrada.{' '}
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
        title={editingId ? 'Editar Nota de Serviço' : 'Nova Nota de Serviço'}
        width="560px"
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
        {/* PDF drop-zone */}
        {!editingId && (
          <div className="mb-4 rounded-lg border-2 border-dashed border-cbmes-blue/30 bg-cbmes-blue/5 p-4 text-center">
            <p className="text-sm font-medium text-cbmes-blue">📄 Importar via PDF (opcional)</p>
            <p className="mt-1 text-xs text-slate-600">
              Selecione um PDF de Nota de Serviço para pré-preencher os campos.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                void handlePdfFile(file);
                if (e.target) e.target.value = '';
              }}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={pdfLoading}
              className="mt-2 rounded-button border border-cbmes-blue bg-white px-3 py-1.5 text-xs font-medium text-cbmes-blue hover:bg-cbmes-blue/10 disabled:opacity-50"
            >
              {pdfLoading ? 'Processando…' : 'Escolher PDF'}
            </button>
            {pdfMsg && <p className="mt-2 text-xs text-slate-700">{pdfMsg}</p>}
          </div>
        )}

        <NotaServicoForm
          form={form}
          setForm={setForm}
          formError={formError}
          locked={!podeEditar && !!editingId}
          onRemoveMilitar={removeMilitar}
          onAddMilitar={addMilitar}
        />
      </SlideOverPanel>
    </div>
  );
}

// ── Form ───────────────────────────────────────────────────────────

interface NotaFormProps {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  formError: string | null;
  locked?: boolean;
  onAddMilitar: (nf: string) => void;
  onRemoveMilitar: (nf: string) => void;
}

function NotaServicoForm({
  form,
  setForm,
  formError,
  locked,
  onAddMilitar,
  onRemoveMilitar,
}: NotaFormProps) {
  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="space-y-4">
      {formError && (
        <div className="rounded border border-feedback-error/30 bg-feedback-error/10 p-3 text-sm text-feedback-error">
          {formError}
        </div>
      )}
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-1">
          <Field label="Código*">
            <input
              type="text"
              value={form.codigo}
              onChange={(e) => update('codigo', e.target.value)}
              disabled={locked}
              placeholder="NS072"
              className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm font-mono"
            />
          </Field>
        </div>
        <div className="col-span-2">
          <Field label="Data*">
            <input
              type="date"
              value={form.data}
              onChange={(e) => update('data', e.target.value)}
              disabled={locked}
              className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
            />
          </Field>
        </div>
      </div>
      <Field label="Descrição*">
        <input
          type="text"
          value={form.descricao}
          onChange={(e) => update('descricao', e.target.value)}
          disabled={locked}
          className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
        />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Início*">
          <input
            type="time"
            value={form.horaInicio}
            onChange={(e) => update('horaInicio', e.target.value)}
            disabled={locked}
            className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Fim*">
          <input
            type="time"
            value={form.horaFim}
            onChange={(e) => update('horaFim', e.target.value)}
            disabled={locked}
            className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Viatura">
          <input
            type="text"
            value={form.viaturaPrefixo}
            onChange={(e) => update('viaturaPrefixo', e.target.value)}
            disabled={locked}
            placeholder="ABTS_01"
            className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm font-mono"
          />
        </Field>
      </div>
      <Field label={`Militares (${form.militaresNfs.length})*`}>
        <div className="rounded border border-slate-300 bg-white p-2">
          {form.militaresNfs.length > 0 && (
            <ul className="mb-2 flex flex-wrap gap-1.5">
              {form.militaresNfs.map((nf) => (
                <li
                  key={nf}
                  className="inline-flex items-center gap-1 rounded-full bg-cbmes-blue/10 px-2 py-0.5 text-xs"
                >
                  <span className="font-mono">{nf}</span>
                  {!locked && (
                    <button
                      type="button"
                      onClick={() => onRemoveMilitar(nf)}
                      aria-label={`Remover ${nf}`}
                      className="text-slate-500 hover:text-feedback-error"
                    >
                      ×
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {!locked && (
            <MilitarSelect
              value=""
              valueRaw=""
              onChange={(nf) => nf && onAddMilitar(nf)}
              placeholder="Adicionar militar…"
            />
          )}
        </div>
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

function formatBR(iso: string): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

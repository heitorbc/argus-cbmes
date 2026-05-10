import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { CreateNotaServicoInput, Militar, NotaServico, Viatura } from '@argus/shared-types';
import { ApiError, api, type NotaServicoPreviewPdfResponse } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { MilitarSelect } from '@/components/militar-select';

interface FormState {
  codigo: string;
  descricao: string;
  data: string;
  horaInicio: string;
  horaFim: string;
  viaturaPrefixo: string;
  militares: { nf: string; raw: string }[];
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
  horaFim: '18:00',
  viaturaPrefixo: '',
  militares: [],
  observacoes: '',
};

export function NotasServicoPage() {
  const { user } = useAuth();
  const isAdmin = user?.papeis.includes('admin') ?? false;
  const isSarg = user?.papeis.includes('sargenteante') ?? false;
  const isFiscal = user?.papeis.includes('fiscal') ?? false;
  const podeCriar = isAdmin || isSarg || isFiscal;
  const podeEditar = isAdmin || isSarg;

  const [notas, setNotas] = useState<NotaServico[]>([]);
  const [viaturas, setViaturas] = useState<Viatura[]>([]);
  const [filtroData, setFiltroData] = useState<string>('');
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
    api
      .viaturasList()
      .then((vs) => {
        if (!cancelled) setViaturas(vs);
      })
      .catch(() => {
        // ignore — viaturas é só para o select; sem elas o user pode não selecionar
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .notasServicoList({ data: filtroData || undefined })
      .then((list) => {
        if (cancelled) return;
        setNotas(list);
        setError(null);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof ApiError ? e.message : 'Erro ao carregar NS');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filtroData, refreshSeed]);

  const reload = () => setRefreshSeed((s) => s + 1);

  const startCreate = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setFormError(null);
    setShowForm(true);
  };

  const startEdit = async (n: NotaServico) => {
    const militares = await Promise.all(
      n.militaresNfs.map(async (nf) => {
        try {
          const m = await api.efetivoFindByNf(nf);
          return { nf, raw: `${m.posto} ${m.nomeGuerra ?? m.nome.split(' ')[0]}` };
        } catch {
          return { nf, raw: `NF ${nf}` };
        }
      }),
    );
    setForm({
      codigo: n.codigo,
      descricao: n.descricao,
      data: n.data,
      horaInicio: n.horaInicio,
      horaFim: n.horaFim,
      viaturaPrefixo: n.viaturaPrefixo ?? '',
      militares,
      observacoes: n.observacoes ?? '',
    });
    setEditingId(n.id);
    setFormError(null);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.militares.length === 0) {
      setFormError('Adicione pelo menos 1 militar escalado.');
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
        militaresNfs: form.militares.map((m) => m.nf),
        observacoes: form.observacoes.trim() || undefined,
      };
      if (editingId) {
        await api.notasServicoUpdate(editingId, payload);
      } else {
        await api.notasServicoCreate(payload);
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

  const handleRemove = async (n: NotaServico) => {
    if (!confirm(`Remover ${n.codigo} - ${n.descricao}?`)) return;
    try {
      await api.notasServicoRemove(n.id);
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao remover');
    }
  };

  const addMilitar = (nf: string | null, m: Militar | null) => {
    if (!nf || !m) return;
    if (form.militares.some((x) => x.nf === nf)) return;
    setForm({
      ...form,
      militares: [
        ...form.militares,
        { nf, raw: `${m.posto} ${m.nomeGuerra ?? m.nome.split(' ')[0]}` },
      ],
    });
  };

  const removeMilitar = (nf: string) => {
    setForm({ ...form, militares: form.militares.filter((m) => m.nf !== nf) });
  };

  // Filtra viaturas disponíveis (não-baixadas) para o select
  const viaturasDisponiveis = viaturas.filter((v) => v.status !== 'BAIXADA');

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-cbmes-blue px-4 py-4 text-white">
        <Link to="/" className="text-sm opacity-90 hover:opacity-100">
          ← Início
        </Link>
        <h1 className="mt-1 text-lg font-bold">Notas de Serviço</h1>
        <p className="text-xs opacity-90">
          Sargenteação · CRUD manual de NS (parser PDF chega no S6m)
        </p>
      </header>

      <section className="mx-auto max-w-3xl p-4">
        <div className="rounded border border-slate-200 bg-white p-3 text-xs text-slate-700">
          <p>
            <strong>S6l:</strong> NS cadastradas aqui aparecem na Prévia do dia (campo "Notas de
            Serviço"). Pode ser registrada também via ajuste pré-turno da Prévia. Posteriormente
            (S6m) será possível importar diretamente dos PDFs em <code>data/Nota de Serviço/</code>.
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

        <div className="mt-3 rounded border border-slate-200 bg-white p-3">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Filtro por data</p>
          <input
            type="date"
            value={filtroData}
            onChange={(e) => setFiltroData(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm sm:w-48"
          />
          {filtroData && (
            <button
              type="button"
              onClick={() => setFiltroData('')}
              className="ml-2 text-xs text-cbmes-blue hover:underline"
            >
              limpar filtro
            </button>
          )}
        </div>

        {podeCriar && !showForm && (
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={startCreate}
              className="rounded-button bg-cbmes-red py-2.5 text-base font-semibold text-white"
            >
              + Nova Nota de Serviço
            </button>
            <ImportarPdfButton
              onPreview={async (resp) => {
                const militares = await Promise.all(
                  resp.militaresNfs.map(async (nf) => {
                    try {
                      const m = await api.efetivoFindByNf(nf);
                      return { nf, raw: `${m.posto} ${m.nomeGuerra ?? m.nome.split(' ')[0]}` };
                    } catch {
                      return { nf, raw: `NF ${nf}` };
                    }
                  }),
                );
                setForm({
                  codigo: resp.codigoSugerido ?? '',
                  descricao: resp.descricaoSugerida ?? '',
                  data: resp.dataSugerida ?? todayIso(),
                  horaInicio: resp.horaInicioSugerida ?? '08:00',
                  horaFim: resp.horaFimSugerida ?? '18:00',
                  viaturaPrefixo: resp.viaturaSugerida ?? '',
                  militares,
                  observacoes: '',
                });
                setEditingId(null);
                setFormError(
                  resp.avisos.length > 0 ? `Avisos do parser: ${resp.avisos.join('; ')}` : null,
                );
                setShowForm(true);
              }}
            />
          </div>
        )}

        {showForm && podeCriar && (
          <form
            onSubmit={handleSubmit}
            className="mt-3 space-y-3 rounded border border-slate-300 bg-white p-4"
          >
            <h2 className="text-sm font-semibold text-slate-700">
              {editingId ? 'Editar NS' : 'Nova Nota de Serviço'}
            </h2>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_2fr]">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">
                  Código <span className="text-feedback-error">*</span>
                </span>
                <input
                  type="text"
                  value={form.codigo}
                  onChange={(e) => setForm({ ...form, codigo: e.target.value })}
                  required
                  placeholder="Ex.: NS077"
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">
                  Descrição <span className="text-feedback-error">*</span>
                </span>
                <input
                  type="text"
                  value={form.descricao}
                  onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                  required
                  placeholder="Ex.: ISEO - Coleta leite materno"
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm"
                />
              </label>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Data</span>
                <input
                  type="date"
                  value={form.data}
                  onChange={(e) => setForm({ ...form, data: e.target.value })}
                  required
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Hora início</span>
                <input
                  type="time"
                  value={form.horaInicio}
                  onChange={(e) => setForm({ ...form, horaInicio: e.target.value })}
                  required
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Hora fim</span>
                <input
                  type="time"
                  value={form.horaFim}
                  onChange={(e) => setForm({ ...form, horaFim: e.target.value })}
                  required
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm"
                />
              </label>
            </div>

            <label className="block">
              <span className="text-sm font-medium text-slate-700">
                Viatura <span className="text-[10px] text-slate-500">(opcional)</span>
              </span>
              <select
                value={form.viaturaPrefixo}
                onChange={(e) => setForm({ ...form, viaturaPrefixo: e.target.value })}
                className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm"
              >
                <option value="">— Nenhuma viatura</option>
                {viaturasDisponiveis.map((v) => (
                  <option key={v.id} value={v.prefixo}>
                    {v.prefixo} {v.funcaoOperacional ? `(${v.funcaoOperacional})` : ''}
                  </option>
                ))}
              </select>
            </label>

            <fieldset className="rounded border border-slate-200 p-2">
              <legend className="px-1 text-sm font-medium text-slate-700">
                Militares escalados <span className="text-feedback-error">*</span>
              </legend>
              <p className="text-[10px] text-slate-500">
                {form.militares.length} militar(es) selecionado(s).
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                {form.militares.map((m) => (
                  <span
                    key={m.nf}
                    className="rounded-full bg-cbmes-blue/10 px-3 py-1 text-xs text-cbmes-blue"
                  >
                    {m.raw}
                    <button
                      type="button"
                      onClick={() => removeMilitar(m.nf)}
                      className="ml-1 text-feedback-error"
                      aria-label={`Remover ${m.raw}`}
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
              <div className="mt-2">
                <MilitarSelect
                  value={undefined}
                  valueRaw={undefined}
                  onChange={addMilitar}
                  placeholder="+ Adicionar militar"
                  excluirNfs={form.militares.map((m) => m.nf)}
                />
              </div>
            </fieldset>

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
                {saving ? 'Salvando…' : editingId ? 'Salvar alterações' : 'Criar NS'}
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
          {!loading && notas.length === 0 && (
            <p className="text-sm text-slate-500">Nenhuma NS no filtro atual.</p>
          )}
          {notas.length > 0 && (
            <p className="text-xs text-slate-600">{notas.length} NS encontrada(s)</p>
          )}
          {notas.map((n) => (
            <div key={n.id} className="rounded border border-slate-200 bg-white p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-cbmes-blue">
                    <span className="rounded-full bg-cbmes-blue/15 px-2 py-0.5 text-xs">
                      {n.codigo}
                    </span>{' '}
                    {n.descricao}
                  </p>
                  <p className="mt-1 text-xs text-slate-700">
                    {n.data} · {n.horaInicio}–{n.horaFim}
                    {n.viaturaPrefixo && <> · 🚒 {n.viaturaPrefixo}</>}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    👥 {n.militaresNfs.length} militar(es): {n.militaresNfs.join(', ')}
                  </p>
                  {n.observacoes && (
                    <p className="mt-1 text-xs italic text-slate-500">{n.observacoes}</p>
                  )}
                </div>
                {podeEditar && (
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => void startEdit(n)}
                      className="rounded border border-cbmes-blue px-3 py-1 text-xs font-medium text-cbmes-blue hover:bg-cbmes-blue/10"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleRemove(n)}
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

/**
 * S6m — Botão de upload de PDF de NS. Chama POST /notas-servico/preview-pdf
 * e devolve o resultado para o caller via `onPreview` (que pré-preenche o
 * formulário).
 */
function ImportarPdfButton({
  onPreview,
}: {
  onPreview: (resp: NotaServicoPreviewPdfResponse) => Promise<void> | void;
}) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setLoading(true);
    setErr(null);
    try {
      const resp = await api.notasServicoPreviewPdf(file);
      await onPreview(resp);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Erro ao importar PDF');
    } finally {
      setLoading(false);
    }
  };

  return (
    <label className="cursor-pointer rounded-button border border-cbmes-blue bg-white py-2.5 text-center text-base font-semibold text-cbmes-blue hover:bg-cbmes-blue/5">
      <input
        type="file"
        accept="application/pdf,.pdf"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = ''; // reset para permitir re-upload do mesmo arquivo
        }}
        className="hidden"
        disabled={loading}
      />
      {loading ? 'Lendo PDF…' : '📄 Importar PDF (preencher formulário)'}
      {err && <span className="ml-2 text-xs text-feedback-error">— {err}</span>}
    </label>
  );
}

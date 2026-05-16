import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  LETRA_EQUIPE_LABEL,
  LETRA_EQUIPE_ROTATIVA,
  type BloqueioReimport,
  type ComposicaoEntry,
  type EscalaDiff,
  type EscalaMensal,
  type LetraEquipe,
  type LetraEquipeRotativa,
} from '@argus/shared-types';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

const MES_LABEL = [
  '',
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

interface ResumoItem {
  ano: number;
  mes: number;
  origemArquivo: string;
  importadoEm: string;
}

const EQUIPE_COLOR: Record<LetraEquipe, string> = {
  A: 'bg-emerald-100 text-emerald-900',
  B: 'bg-amber-100 text-amber-900',
  C: 'bg-sky-100 text-sky-900',
  D: 'bg-rose-100 text-rose-900',
  AQUATICAS: 'bg-violet-100 text-violet-900',
  STAFF: 'bg-slate-200 text-slate-800',
};

export function EscalasPage() {
  const { user } = useAuth();
  const canUpload =
    user?.papeis.includes('admin') || user?.papeis.includes('sargenteante') || false;

  const [list, setList] = useState<ResumoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [preview, setPreview] = useState<EscalaMensal | null>(null);
  const [diff, setDiff] = useState<EscalaDiff | null>(null);
  const [bloqueios, setBloqueios] = useState<BloqueioReimport[]>([]);
  // S2.8.2 — datas em que admin escolheu MANTER a escala vigente
  // (desmarcou "aceitar nova"). Default: aceitar tudo (lista vazia).
  const [diasDescartados, setDiasDescartados] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const [selected, setSelected] = useState<{ ano: number; mes: number } | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<EscalaMensal | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const reload = async () => {
    setLoading(true);
    try {
      const r = await api.escalasList();
      setList(r.escalas);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erro ao carregar escalas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  useEffect(() => {
    if (!selected) {
      setSelectedDetail(null);
      return;
    }
    let cancelled = false;
    setLoadingDetail(true);
    api
      .escalasGet(selected.ano, selected.mes)
      .then((r) => {
        if (!cancelled) setSelectedDetail(r.escala);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof ApiError ? e.message : 'Erro ao carregar detalhe');
      })
      .finally(() => {
        if (!cancelled) setLoadingDetail(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    setPreview(null);
    setDiff(null);
    setBloqueios([]);
    setDiasDescartados(new Set());
    try {
      const r = await api.escalasPreview(file);
      setPreview(r.escala);
      setDiff(r.diff);
      setBloqueios(r.bloqueios ?? []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao processar XLSX');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleConfirm = async () => {
    if (!preview) return;
    setConfirming(true);
    setError(null);
    try {
      await api.escalasConfirm(preview, [...diasDescartados]);
      setPreview(null);
      setDiff(null);
      setBloqueios([]);
      setDiasDescartados(new Set());
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao confirmar escala');
    } finally {
      setConfirming(false);
    }
  };

  const handleCancel = () => {
    setPreview(null);
    setDiff(null);
    setBloqueios([]);
    setDiasDescartados(new Set());
  };

  const toggleDiaDescartado = (data: string) => {
    setDiasDescartados((prev) => {
      const next = new Set(prev);
      if (next.has(data)) next.delete(data);
      else next.add(data);
      return next;
    });
  };

  const handleDelete = async (ano: number, mes: number) => {
    if (!confirm(`Remover escala ${MES_LABEL[mes]}/${ano}?`)) return;
    try {
      await api.escalasDelete(ano, mes);
      if (selected?.ano === ano && selected.mes === mes) setSelected(null);
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
        <h1 className="mt-1 text-lg font-bold">Escala Mensal</h1>
        <p className="text-xs opacity-90">
          Fonte primária: planilha-DB (aba <code>bd_escala_mensal</code>) · XLSX aceito apenas para
          popular ou atualizar a planilha
        </p>
      </header>

      <section className="mx-auto max-w-4xl p-4">
        <div className="rounded border border-slate-200 bg-white p-3 text-xs text-slate-700">
          <p>
            <strong>Origem:</strong> XLSX gerado pelo Sargenteante (1ºSGT) com abas{' '}
            <code className="rounded bg-slate-100 px-1">01 A 14 [MES]</code> e{' '}
            <code className="rounded bg-slate-100 px-1">15 A 29 [MES]</code>.
          </p>
          <p className="mt-1">
            O sistema valida o nome do arquivo, parseia o calendário (dia → equipe) e a composição
            (equipe × viatura × função). Reuploads do mesmo mês geram <strong>diff</strong> antes de
            sobrescrever.
          </p>
        </div>

        {canUpload && (
          <div className="mt-4 rounded border border-cbmes-blue/30 bg-white p-4">
            <h2 className="text-base font-semibold text-cbmes-blue">Importar nova escala</h2>
            <p className="mt-1 text-xs text-slate-600">
              Formato esperado:{' '}
              <code className="rounded bg-slate-100 px-1">MM MES DE AAAA.xlsx</code> — ex.:{' '}
              <code className="rounded bg-slate-100 px-1">05 MAIO DE 2026.xlsx</code>
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              onChange={handleFileChange}
              disabled={uploading || confirming}
              className="mt-3 block w-full rounded border border-slate-300 bg-slate-50 p-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-cbmes-blue file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white"
            />
            {uploading && <p className="mt-2 text-xs text-cbmes-blue">Processando XLSX…</p>}
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="mt-4 rounded border border-feedback-error/30 bg-feedback-error/10 p-3 text-sm text-feedback-error"
          >
            {error}
          </div>
        )}

        {preview && (
          <PreviewPanel
            preview={preview}
            diff={diff}
            bloqueios={bloqueios}
            confirming={confirming}
            diasDescartados={diasDescartados}
            onToggleDia={toggleDiaDescartado}
            onConfirm={handleConfirm}
            onCancel={handleCancel}
          />
        )}

        <h2 className="mt-6 text-base font-semibold text-slate-700">Escalas vigentes</h2>
        {loading && list.length === 0 && <p className="mt-2 text-sm text-slate-500">Carregando…</p>}
        {!loading && list.length === 0 && (
          <p className="mt-2 rounded border border-dashed border-slate-300 bg-white p-4 text-center text-sm text-slate-500">
            Nenhuma escala importada ainda.
          </p>
        )}
        <ul className="mt-2 divide-y divide-slate-200 rounded border border-slate-200 bg-white">
          {list.map((e) => {
            const isSelected = selected?.ano === e.ano && selected.mes === e.mes;
            return (
              <li key={`${e.ano}-${e.mes}`} className="p-3 text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setSelected(isSelected ? null : { ano: e.ano, mes: e.mes })}
                    className="text-left font-medium text-cbmes-blue hover:underline"
                  >
                    {MES_LABEL[e.mes]} / {e.ano}
                  </button>
                  <span className="shrink-0 text-xs text-slate-500">
                    {new Date(e.importadoEm).toLocaleString('pt-BR')}
                  </span>
                </div>
                <p className="mt-1 font-mono text-xs text-slate-500">{e.origemArquivo}</p>
                {canUpload && (
                  <button
                    type="button"
                    onClick={() => handleDelete(e.ano, e.mes)}
                    className="mt-2 rounded-button border border-feedback-error px-3 py-1 text-xs font-medium text-feedback-error hover:bg-feedback-error/10"
                  >
                    Remover
                  </button>
                )}
                {isSelected && (
                  <div className="mt-3 rounded bg-slate-50 p-3">
                    {loadingDetail ? (
                      <p className="text-xs text-slate-500">Carregando detalhe…</p>
                    ) : selectedDetail ? (
                      <DetalheEscala
                        escala={selectedDetail}
                        canEdit={canUpload}
                        onChange={(updated) => setSelectedDetail(updated)}
                      />
                    ) : (
                      <p className="text-xs text-slate-500">Sem detalhe disponível.</p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}

function DetalheEscala({
  escala,
  canEdit,
  onChange,
}: {
  escala: EscalaMensal;
  canEdit: boolean;
  onChange: (updated: EscalaMensal) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [savingDay, setSavingDay] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quinzenaAtiva, setQuinzenaAtiva] = useState<1 | 2>(1);

  const updateDay = async (data: string, equipe: LetraEquipeRotativa | null) => {
    setSavingDay(data);
    setError(null);
    try {
      const r = await api.escalasUpdateDiaEquipe(escala.ano, escala.mes, data, equipe);
      onChange(r);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao salvar');
    } finally {
      setSavingDay(null);
    }
  };

  const upsertComposicao = async (
    equipe: LetraEquipe,
    viatura: string,
    funcao: string,
    raw: string,
  ) => {
    setError(null);
    try {
      const militar =
        raw.trim().length === 0
          ? null
          : { raw: raw.trim(), postoAbreviado: '', nomeGuerra: raw.trim().toUpperCase() };
      const r = await api.escalasUpsertComposicao(escala.ano, escala.mes, quinzenaAtiva, {
        equipe,
        viatura,
        funcao,
        militar,
      });
      onChange(r);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao salvar composição');
    }
  };

  const bucket = quinzenaAtiva === 1 ? 'q1' : 'q2';
  return (
    <div>
      {canEdit && (
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wide text-slate-500">
            {editing ? 'Modo edição ativo' : 'Modo somente leitura'}
          </span>
          <button
            type="button"
            onClick={() => setEditing((e) => !e)}
            className={`rounded-button px-3 py-1 text-xs font-semibold ${
              editing
                ? 'bg-slate-700 text-white'
                : 'border border-cbmes-blue text-cbmes-blue hover:bg-cbmes-blue/10'
            }`}
          >
            {editing ? 'Encerrar edição' : '✏️ Editar escala'}
          </button>
        </div>
      )}
      {error && (
        <p
          role="alert"
          className="mb-2 rounded border border-feedback-error/30 bg-feedback-error/10 p-2 text-xs text-feedback-error"
        >
          {error}
        </p>
      )}
      <CalendarioMensal
        diaEquipe={escala.diaEquipe}
        editing={editing}
        savingDay={savingDay}
        onUpdateDay={updateDay}
      />
      <QuinzenaTabs
        ativa={quinzenaAtiva}
        onChange={setQuinzenaAtiva}
        ultimoDiaQ1={escala.composicaoPorQuinzena.ultimoDiaQ1}
        ultimoDiaMes={ultimoDiaDoMes(escala.ano, escala.mes)}
      />
      <ComposicaoTable
        composicao={escala.composicaoPorQuinzena[bucket]}
        editing={editing}
        onUpsert={upsertComposicao}
      />
      {escala.mergulho && (
        <MergulhoSection mergulho={escala.mergulho} ano={escala.ano} mes={escala.mes} />
      )}
      {escala.salvamar && (
        <SalvamarSection salvamar={escala.salvamar} ano={escala.ano} mes={escala.mes} />
      )}
    </div>
  );
}

function ultimoDiaDoMes(ano: number, mes: number): number {
  return new Date(ano, mes, 0).getDate();
}

function QuinzenaTabs({
  ativa,
  onChange,
  ultimoDiaQ1,
  ultimoDiaMes,
}: {
  ativa: 1 | 2;
  onChange: (q: 1 | 2) => void;
  ultimoDiaQ1: number;
  ultimoDiaMes: number;
}) {
  const inicioQ2 = ultimoDiaQ1 + 1;
  const baseBtn = 'flex-1 min-h-[44px] rounded-button text-xs font-semibold transition-colors';
  return (
    <div className="mt-3 flex gap-1 rounded-button bg-slate-100 p-1">
      <button
        type="button"
        onClick={() => onChange(1)}
        className={`${baseBtn} ${
          ativa === 1 ? 'bg-cbmes-blue text-white' : 'text-cbmes-blue hover:bg-cbmes-blue/10'
        }`}
      >
        1ª quinzena · dias 1–{ultimoDiaQ1}
      </button>
      <button
        type="button"
        onClick={() => onChange(2)}
        className={`${baseBtn} ${
          ativa === 2 ? 'bg-cbmes-blue text-white' : 'text-cbmes-blue hover:bg-cbmes-blue/10'
        }`}
      >
        2ª quinzena · dias {inicioQ2}–{ultimoDiaMes}
      </button>
    </div>
  );
}

function PreviewPanel({
  preview,
  diff,
  bloqueios,
  confirming,
  diasDescartados,
  onToggleDia,
  onConfirm,
  onCancel,
}: {
  preview: EscalaMensal;
  diff: EscalaDiff | null;
  bloqueios: BloqueioReimport[];
  confirming: boolean;
  diasDescartados: Set<string>;
  onToggleDia: (data: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [quinzenaAtiva, setQuinzenaAtiva] = useState<1 | 2>(1);
  const bucket = quinzenaAtiva === 1 ? 'q1' : 'q2';
  const totalPosicoes =
    preview.composicaoPorQuinzena.q1.length + preview.composicaoPorQuinzena.q2.length;
  const diffQ1 = diff?.composicaoAlteradaPorQuinzena.q1 ?? [];
  const diffQ2 = diff?.composicaoAlteradaPorQuinzena.q2 ?? [];
  const hasDiff =
    diff !== null && (diff.diasAlterados.length > 0 || diffQ1.length > 0 || diffQ2.length > 0);

  return (
    <div className="mt-4 rounded border-2 border-cbmes-blue bg-white p-4">
      <h2 className="text-base font-semibold text-cbmes-blue">
        Preview: {MES_LABEL[preview.mes]} / {preview.ano}
      </h2>
      <p className="mt-1 text-xs text-slate-600">
        Origem: <span className="font-mono">{preview.origemArquivo}</span> ·{' '}
        {Object.keys(preview.diaEquipe).length} dias mapeados · {totalPosicoes} posições (
        {preview.composicaoPorQuinzena.q1.length} na 1ª, {preview.composicaoPorQuinzena.q2.length}{' '}
        na 2ª)
      </p>

      {preview.avisos.length > 0 && (
        <details className="mt-3 rounded bg-amber-50 p-3 text-xs text-amber-900">
          <summary className="cursor-pointer font-semibold">
            ⚠️ {preview.avisos.length} aviso(s) durante o parse
          </summary>
          <ul className="mt-2 list-inside list-disc space-y-1">
            {preview.avisos.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </details>
      )}

      {hasDiff && (
        <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-3 text-xs">
          <p className="font-semibold text-amber-900">
            Reupload — diferenças em relação à escala vigente
          </p>
          {diff!.diasAlterados.length > 0 && (
            <div className="mt-3">
              <p className="font-medium text-amber-900">
                Dias com mudança de equipe — escolha para cada dia:
              </p>
              <p className="mt-0.5 text-[10px] text-amber-800">
                Default = aceitar nova (do XLSX). Desmarque para manter a versão atual.
              </p>
              <ul className="mt-2 space-y-2">
                {diff!.diasAlterados.map((d) => {
                  const manterAtual = diasDescartados.has(d.data);
                  return (
                    <li
                      key={d.data}
                      className="grid grid-cols-1 gap-2 rounded border border-amber-200 bg-white p-2 sm:grid-cols-[1fr_auto_1fr_auto]"
                    >
                      <label
                        className={`flex cursor-pointer items-start gap-2 rounded border p-2 ${
                          manterAtual ? 'border-cbmes-blue bg-cbmes-blue/5' : 'border-slate-200'
                        }`}
                      >
                        <input
                          type="radio"
                          name={`escolha-${d.data}`}
                          checked={manterAtual}
                          onChange={() => {
                            if (!manterAtual) onToggleDia(d.data);
                          }}
                          className="mt-0.5"
                        />
                        <div>
                          <div className="text-[10px] uppercase tracking-wide text-slate-500">
                            Manter atual
                          </div>
                          <div className="mt-0.5 font-semibold text-slate-800">{d.data}</div>
                          <div className="mt-0.5 text-slate-700">
                            Equipe: <strong>{d.equipeAntes ?? '∅'}</strong>
                          </div>
                        </div>
                      </label>
                      <span className="hidden self-center text-slate-400 sm:inline">→</span>
                      <label
                        className={`flex cursor-pointer items-start gap-2 rounded border p-2 ${
                          !manterAtual ? 'border-cbmes-red bg-cbmes-red/5' : 'border-slate-200'
                        }`}
                      >
                        <input
                          type="radio"
                          name={`escolha-${d.data}`}
                          checked={!manterAtual}
                          onChange={() => {
                            if (manterAtual) onToggleDia(d.data);
                          }}
                          className="mt-0.5"
                        />
                        <div>
                          <div className="text-[10px] uppercase tracking-wide text-slate-500">
                            Aceitar nova (padrão)
                          </div>
                          <div className="mt-0.5 font-semibold text-slate-800">{d.data}</div>
                          <div className="mt-0.5 text-slate-700">
                            Equipe: <strong>{d.equipeDepois ?? '∅'}</strong>
                          </div>
                        </div>
                      </label>
                      <span className="self-center" />
                    </li>
                  );
                })}
              </ul>
              {diasDescartados.size > 0 && (
                <p className="mt-2 text-[11px] italic text-cbmes-blue">
                  {diasDescartados.size} dia
                  {diasDescartados.size > 1 ? 's serão mantidos' : ' será mantido'} na versão atual
                  ao confirmar.
                </p>
              )}
            </div>
          )}
          <DiffComposicaoBlock titulo="Composição 1ª quinzena alterada" entries={diffQ1} />
          <DiffComposicaoBlock titulo="Composição 2ª quinzena alterada" entries={diffQ2} />
        </div>
      )}

      <CalendarioMensal diaEquipe={preview.diaEquipe} />

      <QuinzenaTabs
        ativa={quinzenaAtiva}
        onChange={setQuinzenaAtiva}
        ultimoDiaQ1={preview.composicaoPorQuinzena.ultimoDiaQ1}
        ultimoDiaMes={ultimoDiaDoMes(preview.ano, preview.mes)}
      />

      <ComposicaoTable composicao={preview.composicaoPorQuinzena[bucket]} />

      {preview.mergulho && (
        <MergulhoSection mergulho={preview.mergulho} ano={preview.ano} mes={preview.mes} />
      )}
      {preview.salvamar && (
        <SalvamarSection salvamar={preview.salvamar} ano={preview.ano} mes={preview.mes} />
      )}

      {bloqueios.length > 0 && (
        <div className="mt-3 rounded border border-feedback-error/40 bg-feedback-error/10 p-3 text-xs text-feedback-error">
          <p className="font-semibold">
            🚫 Re-import bloqueado — {bloqueios.length} dia
            {bloqueios.length > 1 ? 's' : ''} em uso
          </p>
          <ul className="mt-2 list-inside list-disc space-y-0.5">
            {bloqueios.map((b) => (
              <li key={b.data}>
                <strong>{b.data}</strong>: {b.motivo}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] italic">
            Cancele a Prévia ou aguarde o encerramento do Serviço dos dias acima antes de
            re-importar a escala.
          </p>
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={confirming || bloqueios.length > 0}
          title={bloqueios.length > 0 ? 'Há dias em uso — destrave-os primeiro' : undefined}
          className="flex-1 rounded-button bg-cbmes-red py-2 text-base font-semibold text-white disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {confirming ? 'Salvando…' : 'Confirmar e salvar'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={confirming}
          className="flex-1 rounded-button border border-slate-300 bg-white py-2 text-base text-slate-700"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

function DiffComposicaoBlock({
  titulo,
  entries,
}: {
  titulo: string;
  entries: EscalaDiff['composicaoAlteradaPorQuinzena']['q1'];
}) {
  if (entries.length === 0) return null;
  return (
    <div className="mt-2">
      <p className="font-medium">{titulo}:</p>
      <ul className="mt-1 list-inside list-disc">
        {entries.slice(0, 20).map((c, i) => (
          <li key={i}>
            {c.equipe}/{c.viatura}/{c.funcao}: {c.antes ?? '∅'} → <strong>{c.depois ?? '∅'}</strong>
          </li>
        ))}
        {entries.length > 20 && <li className="italic">+ {entries.length - 20} outras</li>}
      </ul>
    </div>
  );
}

function MergulhoSection({
  mergulho,
  ano,
  mes,
}: {
  mergulho: NonNullable<EscalaMensal['mergulho']>;
  ano: number;
  mes: number;
}) {
  const letras: Array<'A' | 'B' | 'C'> = ['A', 'B', 'C'];
  const datasComEscala = Object.keys(mergulho.porDia).sort();
  const [quinzena, setQuinzena] = useState<1 | 2>(1);
  const bucket = quinzena === 1 ? mergulho.equipesPorQuinzena.q1 : mergulho.equipesPorQuinzena.q2;
  return (
    <section className="mt-4 rounded border border-violet-200 bg-violet-50 p-3">
      <h3 className="text-sm font-semibold text-violet-900">🤿 Mergulho — cadastro das equipes</h3>
      <QuinzenaTabs
        ativa={quinzena}
        onChange={setQuinzena}
        ultimoDiaQ1={mergulho.equipesPorQuinzena.ultimoDiaQ1}
        ultimoDiaMes={ultimoDiaDoMes(ano, mes)}
      />
      <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
        {letras.map((letra) => {
          const eq = bucket[letra];
          if (!eq) return null;
          return (
            <article key={letra} className="rounded border border-violet-200 bg-white p-2 text-xs">
              <p className="font-bold text-violet-800">Equipe {letra}</p>
              <dl className="mt-1 space-y-0.5">
                {eq.chefe && (
                  <div>
                    <dt className="inline text-violet-700">Ch:</dt>{' '}
                    <dd className="inline">
                      {eq.chefe.postoAbreviado} {eq.chefe.nomeGuerra}
                    </dd>
                  </div>
                )}
                {eq.motorista && (
                  <div>
                    <dt className="inline text-violet-700">Mot:</dt>{' '}
                    <dd className="inline">
                      {eq.motorista.postoAbreviado} {eq.motorista.nomeGuerra}
                    </dd>
                  </div>
                )}
                {eq.mergulhadores.map((m, i) => (
                  <div key={i}>
                    <dt className="inline text-violet-700">M{i + 1}:</dt>{' '}
                    <dd className="inline">
                      {m.postoAbreviado} {m.nomeGuerra}
                    </dd>
                  </div>
                ))}
              </dl>
            </article>
          );
        })}
      </div>
      {datasComEscala.length > 0 && (
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <CalendarioRecurso
            titulo="MERGULHO 01 (AM_002)"
            dias={Object.fromEntries(
              datasComEscala
                .filter((d) => mergulho.porDia[d]!.mergulho01)
                .map((d) => [d, mergulho.porDia[d]!.mergulho01!]),
            )}
            cores={MERGULHO_COLOR}
            accent="violet"
          />
          <CalendarioRecurso
            titulo="MERGULHO 02 (AM_003)"
            dias={Object.fromEntries(
              datasComEscala
                .filter((d) => mergulho.porDia[d]!.mergulho02)
                .map((d) => [d, mergulho.porDia[d]!.mergulho02!]),
            )}
            cores={MERGULHO_COLOR}
            accent="violet"
          />
        </div>
      )}
    </section>
  );
}

const MERGULHO_COLOR: Record<string, string> = {
  A: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  B: 'bg-amber-100 text-amber-900 border-amber-300',
  C: 'bg-sky-100 text-sky-900 border-sky-300',
};

const SALVAMAR_COLOR: Record<string, string> = {
  E: 'bg-cyan-100 text-cyan-900 border-cyan-300',
  F: 'bg-fuchsia-100 text-fuchsia-900 border-fuchsia-300',
};

/**
 * S0.x — Calendário read-only de um recurso (MERGULHO 01/02 ou
 * SALVAMAR 01) mostrando qual letra de equipe ocupa cada dia. Mesmo
 * layout grid-7 do CalendarioMensal das rotativas para coerência
 * visual, sem edição (alteração só via reimport do XLSX).
 */
const ACCENT_STYLES: Record<'violet' | 'amber', { border: string; header: string }> = {
  violet: { border: 'border-violet-200', header: 'text-violet-800' },
  amber: { border: 'border-amber-200', header: 'text-amber-800' },
};

function CalendarioRecurso({
  titulo,
  dias,
  cores,
  accent,
}: {
  titulo: string;
  dias: Record<string, string>;
  cores: Record<string, string>;
  accent: 'violet' | 'amber';
}) {
  const entries = Object.entries(dias).sort(([a], [b]) => a.localeCompare(b));
  const styles = ACCENT_STYLES[accent];
  const usadas = new Set(entries.map(([, l]) => l));
  if (entries.length === 0) {
    return (
      <article className={`rounded border ${styles.border} bg-white p-2 text-xs`}>
        <p className={`font-semibold ${styles.header}`}>{titulo}</p>
        <p className="mt-1 italic text-slate-500">Sem plantão neste mês.</p>
      </article>
    );
  }
  return (
    <article className={`rounded border ${styles.border} bg-white p-2 text-xs`}>
      <p className={`font-semibold ${styles.header}`}>
        {titulo} · {entries.length} dias
      </p>
      <div className="mt-2 grid grid-cols-7 gap-0.5">
        {entries.map(([data, letra]) => (
          <div
            key={data}
            className={`rounded border p-0.5 text-center ${cores[letra] ?? 'bg-slate-100 text-slate-700 border-slate-300'}`}
          >
            <div className="text-[9px] text-slate-700">
              {data.slice(8, 10)}/{data.slice(5, 7)}
            </div>
            <div className="text-[11px] font-bold">{letra}</div>
          </div>
        ))}
      </div>
      <div className="mt-1 flex flex-wrap gap-1 text-[9px]">
        {[...usadas].sort().map((l) => (
          <span key={l} className={`rounded px-1.5 ${cores[l] ?? 'bg-slate-100'}`}>
            Equipe {l}
          </span>
        ))}
      </div>
    </article>
  );
}

function SalvamarSection({
  salvamar,
  ano,
  mes,
}: {
  salvamar: NonNullable<EscalaMensal['salvamar']>;
  ano: number;
  mes: number;
}) {
  const letras: Array<'E' | 'F'> = ['E', 'F'];
  const datasComEscala = Object.keys(salvamar.porDia).sort();
  const [quinzena, setQuinzena] = useState<1 | 2>(1);
  const bucket = quinzena === 1 ? salvamar.equipesPorQuinzena.q1 : salvamar.equipesPorQuinzena.q2;
  return (
    <section className="mt-4 rounded border border-amber-200 bg-amber-50 p-3">
      <h3 className="text-sm font-semibold text-amber-900">🚒🤿 Salvamar — cadastro das equipes</h3>
      <QuinzenaTabs
        ativa={quinzena}
        onChange={setQuinzena}
        ultimoDiaQ1={salvamar.equipesPorQuinzena.ultimoDiaQ1}
        ultimoDiaMes={ultimoDiaDoMes(ano, mes)}
      />
      <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
        {letras.map((letra) => {
          const eq = bucket[letra];
          if (!eq) return null;
          return (
            <article key={letra} className="rounded border border-amber-200 bg-white p-2 text-xs">
              <p className="font-bold text-amber-800">Equipe {letra}</p>
              <dl className="mt-1 space-y-0.5">
                {eq.supervisores.map((s, i) => (
                  <div key={i}>
                    <dt className="inline text-amber-700">Sup{i + 1}:</dt>{' '}
                    <dd className="inline">
                      {s.postoAbreviado} {s.nomeGuerra}
                    </dd>
                  </div>
                ))}
              </dl>
            </article>
          );
        })}
      </div>
      {datasComEscala.length > 0 && (
        <div className="mt-3">
          <CalendarioRecurso
            titulo="SALVAMAR 01 (AC_001)"
            dias={Object.fromEntries(datasComEscala.map((d) => [d, salvamar.porDia[d]!]))}
            cores={SALVAMAR_COLOR}
            accent="amber"
          />
        </div>
      )}
    </section>
  );
}

function CalendarioMensal({
  diaEquipe,
  editing = false,
  savingDay = null,
  onUpdateDay,
}: {
  diaEquipe: EscalaMensal['diaEquipe'];
  editing?: boolean;
  savingDay?: string | null;
  onUpdateDay?: (data: string, equipe: LetraEquipeRotativa | null) => void;
}) {
  const dias = Object.entries(diaEquipe).sort(([a], [b]) => a.localeCompare(b));
  if (dias.length === 0 && !editing) {
    return (
      <p className="mt-3 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
        Nenhum dia foi mapeado para equipe. Verifique se o XLSX tem as linhas DIAS / EQUIPES
        preenchidas nas abas <code>01 A 14 [MES]</code> e <code>15 A 29 [MES]</code>.
      </p>
    );
  }
  return (
    <div className="mt-3">
      <p className="text-xs font-semibold text-slate-700">
        Calendário (dia → equipe) — {dias.length} dias mapeados
      </p>
      <div className="mt-2 grid grid-cols-7 gap-1 text-xs">
        {dias.map(([data, eq]) => (
          <div
            key={data}
            className={`rounded border border-slate-200 p-1 text-center ${EQUIPE_COLOR[eq]}`}
          >
            <div className="text-[10px] text-slate-700">
              {data.slice(8, 10)}/{data.slice(5, 7)}
            </div>
            {editing ? (
              <select
                value={eq}
                disabled={savingDay === data}
                onChange={(ev) =>
                  onUpdateDay?.(
                    data,
                    ev.target.value === '' ? null : (ev.target.value as LetraEquipeRotativa),
                  )
                }
                className="mt-0.5 w-full rounded border border-slate-300 bg-white px-0.5 py-0.5 text-[10px] font-bold"
              >
                {LETRA_EQUIPE_ROTATIVA.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
                <option value="">∅</option>
              </select>
            ) : (
              <div className="font-bold">{eq}</div>
            )}
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-[10px]">
        {(['A', 'B', 'C', 'D'] as LetraEquipe[]).map((e) => (
          <span key={e} className={`rounded px-2 py-0.5 ${EQUIPE_COLOR[e]}`}>
            {e} = {LETRA_EQUIPE_LABEL[e]}
          </span>
        ))}
      </div>
    </div>
  );
}

function ComposicaoTable({
  composicao,
  editing = false,
  onUpsert,
}: {
  composicao: ComposicaoEntry[];
  editing?: boolean;
  onUpsert?: (equipe: LetraEquipe, viatura: string, funcao: string, raw: string) => void;
}) {
  // Agrupa por equipe
  const byEquipe = new Map<LetraEquipe, ComposicaoEntry[]>();
  for (const c of composicao) {
    if (!byEquipe.has(c.equipe)) byEquipe.set(c.equipe, []);
    byEquipe.get(c.equipe)!.push(c);
  }
  const equipes = [...byEquipe.keys()].sort();
  return (
    <div className="mt-3">
      <p className="text-xs font-semibold text-slate-700">Composição por equipe</p>
      <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
        {equipes.map((eq) => (
          <div key={eq} className={`rounded border border-slate-200 p-2 ${EQUIPE_COLOR[eq]}`}>
            <p className="text-xs font-bold">
              Equipe {eq} — {LETRA_EQUIPE_LABEL[eq]}
            </p>
            <ul className="mt-1 space-y-0.5 text-xs">
              {byEquipe.get(eq)!.map((c, i) => (
                <li key={i} className="flex items-baseline justify-between gap-2">
                  <span className="text-slate-700">
                    {c.viatura} / {c.funcao}
                  </span>
                  {editing ? (
                    <input
                      type="text"
                      defaultValue={c.militar.raw}
                      onBlur={(ev) => {
                        if (ev.target.value !== c.militar.raw) {
                          onUpsert?.(eq, c.viatura, c.funcao, ev.target.value);
                        }
                      }}
                      className="w-44 rounded border border-slate-300 bg-white px-1 py-0.5 text-xs"
                      placeholder="Vazio = remover"
                    />
                  ) : (
                    <span className="font-medium">{c.militar.raw}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

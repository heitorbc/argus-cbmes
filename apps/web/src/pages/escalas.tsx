import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  LETRA_EQUIPE_LABEL,
  type EscalaDiff,
  type EscalaMensal,
  type LetraEquipe,
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
    try {
      const r = await api.escalasPreview(file);
      setPreview(r.escala);
      setDiff(r.diff);
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
      await api.escalasConfirm(preview);
      setPreview(null);
      setDiff(null);
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
        <p className="text-xs opacity-90">Cadastros Mestre · Upload do XLSX do Sargenteante</p>
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
          <div className="mt-4 rounded border-2 border-cbmes-blue bg-white p-4">
            <h2 className="text-base font-semibold text-cbmes-blue">
              Preview: {MES_LABEL[preview.mes]} / {preview.ano}
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              Origem: <span className="font-mono">{preview.origemArquivo}</span> ·{' '}
              {Object.keys(preview.diaEquipe).length} dias mapeados · {preview.composicao.length}{' '}
              posições
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

            {diff && (diff.diasAlterados.length > 0 || diff.composicaoAlterada.length > 0) && (
              <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-3 text-xs">
                <p className="font-semibold text-amber-900">
                  Reupload — diferenças em relação à escala vigente
                </p>
                {diff.diasAlterados.length > 0 && (
                  <div className="mt-2">
                    <p className="font-medium">Dias com mudança de equipe:</p>
                    <ul className="mt-1 list-inside list-disc">
                      {diff.diasAlterados.map((d) => (
                        <li key={d.data}>
                          {d.data}: {d.equipeAntes ?? '∅'} →{' '}
                          <strong>{d.equipeDepois ?? '∅'}</strong>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {diff.composicaoAlterada.length > 0 && (
                  <div className="mt-2">
                    <p className="font-medium">Composição alterada:</p>
                    <ul className="mt-1 list-inside list-disc">
                      {diff.composicaoAlterada.slice(0, 20).map((c, i) => (
                        <li key={i}>
                          {c.equipe}/{c.viatura}/{c.funcao}: {c.antes ?? '∅'} →{' '}
                          <strong>{c.depois ?? '∅'}</strong>
                        </li>
                      ))}
                      {diff.composicaoAlterada.length > 20 && (
                        <li className="italic">+ {diff.composicaoAlterada.length - 20} outras</li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <ComposicaoTable composicao={preview.composicao} />

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={handleConfirm}
                disabled={confirming}
                className="flex-1 rounded-button bg-cbmes-red py-2 text-base font-semibold text-white disabled:opacity-60"
              >
                {confirming ? 'Salvando…' : 'Confirmar e salvar'}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={confirming}
                className="flex-1 rounded-button border border-slate-300 bg-white py-2 text-base text-slate-700"
              >
                Cancelar
              </button>
            </div>
          </div>
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
                      <DetalheEscala escala={selectedDetail} />
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

function DetalheEscala({ escala }: { escala: EscalaMensal }) {
  const dias = Object.entries(escala.diaEquipe).sort(([a], [b]) => a.localeCompare(b));
  return (
    <div>
      <p className="text-xs font-semibold text-slate-700">Calendário (dia → equipe)</p>
      <div className="mt-2 grid grid-cols-7 gap-1 text-xs">
        {dias.map(([data, eq]) => (
          <div
            key={data}
            className={`rounded border border-slate-200 p-1 text-center ${EQUIPE_COLOR[eq]}`}
          >
            <div className="text-[10px] text-slate-700">
              {data.slice(8, 10)}/{data.slice(5, 7)}
            </div>
            <div className="font-bold">{eq}</div>
          </div>
        ))}
      </div>
      <ComposicaoTable composicao={escala.composicao} />
    </div>
  );
}

function ComposicaoTable({ composicao }: { composicao: EscalaMensal['composicao'] }) {
  // Agrupa por equipe
  const byEquipe = new Map<LetraEquipe, EscalaMensal['composicao']>();
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
                <li key={i} className="flex justify-between gap-2">
                  <span className="text-slate-700">
                    {c.viatura} / {c.funcao}
                  </span>
                  <span className="font-medium">{c.militar.raw}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

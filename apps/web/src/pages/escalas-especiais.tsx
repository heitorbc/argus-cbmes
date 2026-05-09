import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { EscalaEspecialMensal } from '@argus/shared-types';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { formatEscalaEspecialParaWhatsapp } from '@/lib/whatsapp-especial';

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
  totalAtos: number;
}

export function EscalasEspeciaisPage() {
  const { user } = useAuth();
  const canUpload =
    user?.papeis.includes('admin') || user?.papeis.includes('sargenteante') || false;

  const [list, setList] = useState<ResumoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [preview, setPreview] = useState<EscalaEspecialMensal | null>(null);
  const [descartados, setDescartados] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const [selected, setSelected] = useState<{ ano: number; mes: number } | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<EscalaEspecialMensal | null>(null);
  const [copied, setCopied] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const reload = async () => {
    setLoading(true);
    try {
      const r = await api.escalasEspeciaisList();
      setList(r.escalas);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erro ao carregar escalas especiais');
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
    api
      .escalasEspeciaisGet(selected.ano, selected.mes)
      .then((r) => {
        if (!cancelled) setSelectedDetail(r.escala);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof ApiError ? e.message : 'Erro ao carregar detalhe');
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
    try {
      const r = await api.escalasEspeciaisPreview(file);
      setPreview(r.escala);
      setDescartados(r.descartados);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao processar XLSM');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleConfirm = async () => {
    if (!preview) return;
    setConfirming(true);
    try {
      await api.escalasEspeciaisConfirm(preview);
      setPreview(null);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao confirmar');
    } finally {
      setConfirming(false);
    }
  };

  const handleDelete = async (ano: number, mes: number) => {
    if (!confirm(`Remover escala especial ${MES_LABEL[mes]}/${ano}?`)) return;
    try {
      await api.escalasEspeciaisDelete(ano, mes);
      if (selected?.ano === ano && selected.mes === mes) setSelected(null);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro ao remover');
    }
  };

  const handleCopyWhatsapp = async (escala: EscalaEspecialMensal) => {
    try {
      await navigator.clipboard.writeText(formatEscalaEspecialParaWhatsapp(escala));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao copiar');
    }
  };

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-cbmes-red px-4 py-4 text-white">
        <Link to="/" className="text-sm opacity-90 hover:opacity-100">
          ← Início
        </Link>
        <h1 className="mt-1 text-lg font-bold">Escala Especial</h1>
        <p className="text-xs opacity-90">Cadastros Mestre · Upload do XLSM da Escala Especial</p>
      </header>

      <section className="mx-auto max-w-4xl p-4">
        <div className="rounded border border-slate-200 bg-white p-3 text-xs text-slate-700">
          <p>
            <strong>Origem:</strong> XLSM gerado pelo Sargenteante (1ºSGT) com aba{' '}
            <code className="rounded bg-slate-100 px-1">Modelo Aviso - Especial</code>.
          </p>
          <p className="mt-1">
            O sistema valida o nome do arquivo e parseia a tabela de atos especiais (MILITAR |
            HORÁRIO | DATA | FUNÇÃO). Atos com militar = "XXX" (turno vago) são descartados
            automaticamente.
          </p>
        </div>

        {canUpload && (
          <div className="mt-4 rounded border border-cbmes-blue/30 bg-white p-4">
            <h2 className="text-base font-semibold text-cbmes-blue">
              Importar nova escala especial
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              Formato esperado:{' '}
              <code className="rounded bg-slate-100 px-1">
                MM - ESCALA ESPECIAL 1ª CIA - MES.xlsm
              </code>
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsm,.xlsx"
              onChange={handleFileChange}
              disabled={uploading || confirming}
              className="mt-3 block w-full rounded border border-slate-300 bg-slate-50 p-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-cbmes-blue file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white"
            />
            {uploading && <p className="mt-2 text-xs text-cbmes-blue">Processando XLSM…</p>}
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
              {preview.atos.length} atos · {descartados} descartados (XXX)
            </p>
            <AtosTable atos={preview.atos} />
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
                onClick={() => setPreview(null)}
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
            Nenhuma escala especial importada ainda.
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
                    {e.totalAtos} atos · {new Date(e.importadoEm).toLocaleString('pt-BR')}
                  </span>
                </div>
                <p className="mt-1 font-mono text-xs text-slate-500">{e.origemArquivo}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {selectedDetail && isSelected && (
                    <button
                      type="button"
                      onClick={() => handleCopyWhatsapp(selectedDetail)}
                      className="rounded-button bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                    >
                      {copied ? '✓ Copiado!' : '📋 Copiar Aviso WhatsApp'}
                    </button>
                  )}
                  {canUpload && (
                    <button
                      type="button"
                      onClick={() => handleDelete(e.ano, e.mes)}
                      className="rounded-button border border-feedback-error px-3 py-1 text-xs font-medium text-feedback-error hover:bg-feedback-error/10"
                    >
                      Remover
                    </button>
                  )}
                </div>
                {isSelected && selectedDetail && (
                  <div className="mt-3 rounded bg-slate-50 p-3">
                    <AtosTable atos={selectedDetail.atos} />
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

function AtosTable({ atos }: { atos: EscalaEspecialMensal['atos'] }) {
  // Agrupa por data
  const byData = new Map<string, EscalaEspecialMensal['atos']>();
  for (const a of atos) {
    const arr = byData.get(a.data) ?? [];
    arr.push(a);
    byData.set(a.data, arr);
  }
  const datas = [...byData.keys()].sort();

  return (
    <div className="mt-3">
      <p className="text-xs font-semibold text-slate-700">{atos.length} atos especiais</p>
      <div className="mt-2 max-h-96 overflow-y-auto">
        {datas.map((data) => (
          <div key={data} className="mb-3">
            <p className="text-xs font-bold text-cbmes-blue">{data}</p>
            <ul className="mt-1 space-y-0.5 text-xs">
              {byData.get(data)!.map((a, i) => (
                <li key={i} className="flex justify-between gap-2 border-b border-slate-100 py-0.5">
                  <span className="font-medium">{a.militarRaw}</span>
                  <span className="text-slate-600">
                    {a.horario} <span className="italic">({a.funcao})</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

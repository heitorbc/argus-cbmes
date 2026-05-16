import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { TrocaAutorizada } from '@argus/shared-types';
import { ApiError, api } from '@/lib/api';

/**
 * S0.5/PR1 — Página Sargenteação: lista trocas autorizadas (planilha
 * externa). Read-only. As trocas listadas também entram automaticamente
 * na composição da Prévia/PD por data via `PreviaService`.
 */
export function TrocasPage() {
  const [todas, setTodas] = useState<TrocaAutorizada[]>([]);
  const [filtroData, setFiltroData] = useState<string>('');
  const [filtroMilitar, setFiltroMilitar] = useState<string>('');
  const [apenasFuturas, setApenasFuturas] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selecionada, setSelecionada] = useState<TrocaAutorizada | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .trocasAutorizadasList()
      .then((list) => {
        if (cancelled) return;
        setTodas(list);
        setError(null);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof ApiError ? e.message : 'Erro ao carregar trocas');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtradas = useMemo(() => {
    const hoje = new Date().toISOString().slice(0, 10);
    return todas.filter((t) => {
      if (filtroData && t.dataEscala !== filtroData && t.dataPagamento !== filtroData) return false;
      if (filtroMilitar) {
        const needle = filtroMilitar.toUpperCase();
        const matches =
          t.escaladoOriginal.toUpperCase().includes(needle) ||
          t.substituto.toUpperCase().includes(needle) ||
          t.escaladoPagamento.toUpperCase().includes(needle) ||
          t.substitutoPagamento.toUpperCase().includes(needle);
        if (!matches) return false;
      }
      if (apenasFuturas) {
        const maxData = t.dataEscala > t.dataPagamento ? t.dataEscala : t.dataPagamento;
        if (maxData < hoje) return false;
      }
      return true;
    });
  }, [todas, filtroData, filtroMilitar, apenasFuturas]);

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-cbmes-blue px-4 py-4 text-white">
        <Link to="/" className="text-sm opacity-90 hover:opacity-100">
          ← Home
        </Link>
        <h1 className="mt-1 text-lg font-bold">🔄 Trocas Autorizadas</h1>
        <p className="text-xs opacity-90">
          Planilha externa institucional · entram automaticamente na Prévia/PD
        </p>
      </header>

      <section className="mx-auto max-w-5xl p-4">
        <div className="rounded border border-slate-200 bg-white p-3 text-xs text-slate-600">
          <strong>Fonte:</strong> planilha "Trocas Autorizadas" (Google Sheets, gestão
          institucional). Cada troca tem 2 datas — a data da escala e a data do pagamento — e os
          militares trocam de papéis. <strong>Read-only:</strong> para alterar, use o formulário
          institucional original. As entries autorizadas entram automaticamente em{' '}
          <code>previa.trocas</code> do dia correspondente.
        </div>

        {error && (
          <div className="mt-3 rounded border border-feedback-error/30 bg-feedback-error/10 p-3 text-sm text-feedback-error">
            {error}
          </div>
        )}

        <div className="mt-3 grid grid-cols-1 gap-3 rounded border border-slate-200 bg-white p-3 sm:grid-cols-[1fr_1fr_auto]">
          <label className="block">
            <span className="text-[10px] uppercase tracking-wide text-slate-500">Data</span>
            <input
              type="date"
              value={filtroData}
              onChange={(e) => setFiltroData(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-wide text-slate-500">
              Filtro militar (nome livre)
            </span>
            <input
              type="text"
              value={filtroMilitar}
              onChange={(e) => setFiltroMilitar(e.target.value)}
              placeholder="ex.: MARIANE"
              className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm"
            />
          </label>
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={apenasFuturas}
              onChange={(e) => setApenasFuturas(e.target.checked)}
              className="h-4 w-4"
            />
            Apenas futuras
          </label>
        </div>

        {loading && <p className="mt-4 text-sm text-slate-500">Carregando…</p>}

        {!loading && filtradas.length === 0 && (
          <p className="mt-4 rounded border border-dashed border-slate-300 bg-white p-4 text-center text-sm text-slate-500">
            Nenhuma troca encontrada para o filtro atual.
          </p>
        )}

        {filtradas.length > 0 && (
          <div className="mt-4 overflow-x-auto rounded border border-slate-200 bg-white">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-100">
                <tr className="text-left">
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Data Escala</th>
                  <th className="px-2 py-2">Escalado</th>
                  <th className="px-2 py-2">Substituto</th>
                  <th className="px-2 py-2">Função</th>
                  <th className="px-2 py-2">Horário</th>
                  <th className="px-2 py-2">Data Pagamento</th>
                  <th className="px-2 py-2">Função pgto</th>
                  <th className="px-2 py-2">Dobra</th>
                  <th className="px-2 py-2">E-Docs</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => setSelecionada(t)}
                    className="cursor-pointer border-t border-slate-200 hover:bg-cbmes-blue/5"
                  >
                    <td className="px-2 py-2">
                      <StatusTrocaBadge status={t.statusTroca} />
                    </td>
                    <td className="px-2 py-2 font-medium">{formatDataBr(t.dataEscala)}</td>
                    <td className="px-2 py-2">
                      {t.escaladoOriginal}
                      {t.escaladoOriginalNf && (
                        <span className="ml-1 text-[10px] text-slate-500">
                          (NF {t.escaladoOriginalNf})
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {t.substituto}
                      {t.substitutoNf && (
                        <span className="ml-1 text-[10px] text-slate-500">
                          (NF {t.substitutoNf})
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2">{t.funcao}</td>
                    <td className="px-2 py-2 whitespace-nowrap">{t.horario}</td>
                    <td className="px-2 py-2 font-medium">{formatDataBr(t.dataPagamento)}</td>
                    <td className="px-2 py-2">{t.funcaoPagamento}</td>
                    <td className="px-2 py-2">
                      {t.isDobra48h && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                          48h
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-slate-500">{t.numeroEdocs ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selecionada && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setSelecionada(null)}
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-w-lg rounded border border-slate-300 bg-white p-4 shadow-lg"
          >
            <div className="flex items-baseline justify-between">
              <h2 className="text-base font-bold text-cbmes-blue">Detalhes da troca</h2>
              <StatusTrocaBadge status={selecionada.statusTroca} />
            </div>
            <dl className="mt-3 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs">
              <dt className="font-medium text-slate-600">Status nome:</dt>
              <dd className="text-slate-500">{selecionada.statusNome ?? '—'}</dd>
              <dt className="font-medium text-slate-600">Registro Nº:</dt>
              <dd>{selecionada.numeroRegistro ?? '—'}</dd>
              <dt className="font-medium text-slate-600">Registrado em:</dt>
              <dd>{selecionada.registradoEm}</dd>
              <dt className="font-medium text-slate-600">Por:</dt>
              <dd>{selecionada.emailRegistrante ?? '—'}</dd>
              <dt className="font-medium text-slate-600">Data Escala:</dt>
              <dd>{formatDataBr(selecionada.dataEscala)}</dd>
              <dt className="font-medium text-slate-600">Escalado original:</dt>
              <dd>{selecionada.escaladoOriginal}</dd>
              <dt className="font-medium text-slate-600">Substituto:</dt>
              <dd>{selecionada.substituto}</dd>
              <dt className="font-medium text-slate-600">Função / Horário:</dt>
              <dd>
                {selecionada.funcao} · {selecionada.horario}
              </dd>
              <dt className="font-medium text-slate-600">Data Pagamento:</dt>
              <dd>{formatDataBr(selecionada.dataPagamento)}</dd>
              <dt className="font-medium text-slate-600">Escalado (pgto):</dt>
              <dd>{selecionada.escaladoPagamento}</dd>
              <dt className="font-medium text-slate-600">Substituto (pgto):</dt>
              <dd>{selecionada.substitutoPagamento}</dd>
              <dt className="font-medium text-slate-600">Função / Horário (pgto):</dt>
              <dd>
                {selecionada.funcaoPagamento} · {selecionada.horarioPagamento}
              </dd>
              <dt className="font-medium text-slate-600">Dobra 48h?</dt>
              <dd>{selecionada.isDobra48h ? 'SIM' : 'NÃO'}</dd>
              <dt className="font-medium text-slate-600">Nº E-Docs:</dt>
              <dd>{selecionada.numeroEdocs ?? '—'}</dd>
            </dl>
            <button
              type="button"
              onClick={() => setSelecionada(null)}
              className="mt-4 w-full rounded-button bg-cbmes-blue py-2 text-sm font-semibold text-white"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function formatDataBr(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/**
 * S2.8.3 — Badge visual do STATUS TROCA da planilha. Verde = ambos
 * militares preencheram o formulário (troca confiável). Amarelo = só
 * um lado preencheu (pendente). Cinza = status não-padronizado.
 */
export function StatusTrocaBadge({ status }: { status: 'VERIFICADO' | 'PENDENTE' | undefined }) {
  if (status === 'VERIFICADO') {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800"
        title="Ambos militares preencheram o formulário institucional"
      >
        🟢 VERIFICADO
      </span>
    );
  }
  if (status === 'PENDENTE') {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800"
        title="Apenas um lado preencheu o formulário — confirme com o militar antes de considerar a troca"
      >
        🟡 PENDENTE
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
      —
    </span>
  );
}

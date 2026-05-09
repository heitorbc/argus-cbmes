import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type {
  AjustesPrevia,
  LetraEquipe,
  PreviaDoDia,
  TipoInconsistencia,
} from '@argus/shared-types';
import { ApiError, api } from '@/lib/api';
import { formatPreviaParaWhatsapp } from '@/lib/whatsapp';

const EQUIPE_COLOR: Record<LetraEquipe, string> = {
  A: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  B: 'bg-amber-100 text-amber-900 border-amber-300',
  C: 'bg-sky-100 text-sky-900 border-sky-300',
  D: 'bg-rose-100 text-rose-900 border-rose-300',
  AQUATICAS: 'bg-violet-100 text-violet-900 border-violet-300',
  STAFF: 'bg-slate-200 text-slate-800 border-slate-400',
};

const INCONSISTENCIA_LABEL: Record<TipoInconsistencia, string> = {
  SEM_ESCALA_NO_MES: 'Sem escala importada',
  EQUIPE_NAO_ESCALADA_NO_DIA: 'Sem equipe escalada',
  NF_NAO_RESOLVIDO: 'NF não resolvido',
  AMBIGUIDADE_NOME: 'Ambiguidade no nome',
  FISCAL_SEM_NF_RESOLVIDO: 'Fiscal sem NF',
  IDEO_NAO_CADASTRADO: 'IDEO não cadastrado',
  VIATURA_DESCONHECIDA: 'Viatura desconhecida',
};

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function PreviaPage() {
  const [data, setData] = useState<string>(todayIso());
  const [previa, setPrevia] = useState<PreviaDoDia | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCopyWhatsapp = async () => {
    if (!previa) return;
    try {
      await navigator.clipboard.writeText(formatPreviaParaWhatsapp(previa));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao copiar');
    }
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .previaDoDia(data)
      .then((r) => {
        if (!cancelled) setPrevia(r);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof ApiError ? e.message : 'Erro ao carregar Prévia');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [data]);

  const tripulacaoPorViatura = useMemo(() => {
    if (!previa) return new Map<string, PreviaDoDia['tripulacao']>();
    const map = new Map<string, PreviaDoDia['tripulacao']>();
    for (const t of previa.tripulacao) {
      const key = t.viatura || '(sem viatura)';
      const arr = map.get(key) ?? [];
      arr.push(t);
      map.set(key, arr);
    }
    return map;
  }, [previa]);

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-cbmes-red px-4 py-4 text-white">
        <Link to="/" className="text-sm opacity-90 hover:opacity-100">
          ← Início
        </Link>
        <h1 className="mt-1 text-lg font-bold">Prévia do Mapa Força</h1>
        <p className="text-xs opacity-90">Composição diária consolidada</p>
      </header>

      <section className="mx-auto max-w-3xl p-4">
        <div className="flex items-end gap-3 rounded border border-slate-200 bg-white p-3">
          <div className="flex-1">
            <label htmlFor="data" className="mb-1 block text-xs font-medium text-slate-700">
              Data
            </label>
            <input
              id="data"
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2 text-base"
            />
          </div>
          <button
            type="button"
            onClick={() => setData(todayIso())}
            className="rounded-button border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
          >
            Hoje
          </button>
          <button
            type="button"
            disabled={!previa}
            onClick={handleCopyWhatsapp}
            className="rounded-button bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            title="Copia o texto formatado da Prévia para colar no WhatsApp"
          >
            {copied ? '✓ Copiado!' : '📋 WhatsApp'}
          </button>
        </div>

        {error && (
          <div
            role="alert"
            className="mt-4 rounded border border-feedback-error/30 bg-feedback-error/10 p-3 text-sm text-feedback-error"
          >
            {error}
          </div>
        )}

        {loading && !previa && (
          <p className="mt-6 text-center text-sm text-slate-500">Carregando Prévia…</p>
        )}

        {previa && (
          <>
            <section
              className={`mt-4 rounded border-2 p-4 ${
                previa.equipe ? EQUIPE_COLOR[previa.equipe] : 'border-slate-200 bg-white'
              }`}
            >
              <div className="flex items-baseline justify-between">
                <h2 className="text-base font-bold">
                  {formatDataExtenso(previa.data)}
                  {previa.equipe ? (
                    <>
                      {' '}
                      · Equipe <strong>{previa.equipe}</strong> ({previa.equipeNome})
                    </>
                  ) : (
                    ' · Sem equipe escalada'
                  )}
                </h2>
                <span className="text-xs opacity-80">{previa.origemEscala ?? 'sem fonte'}</span>
              </div>

              {previa.fiscal && (
                <div className="mt-3 rounded bg-white/80 p-3 shadow-inner">
                  <p className="text-xs uppercase tracking-wide opacity-70">
                    Fiscal de Serviço (
                    {previa.fiscal.origem === 'cadastrado' ? 'cadastrado' : 'cálculo padrão'})
                  </p>
                  <p className="mt-1 text-base font-bold">
                    {previa.fiscal.militarResolvido ? (
                      <>
                        {previa.fiscal.militarResolvido.posto}{' '}
                        {previa.fiscal.militarResolvido.nomeGuerra ??
                          previa.fiscal.militarResolvido.nome.split(' ')[0]}
                      </>
                    ) : (
                      <span className="text-feedback-error">
                        NF {previa.fiscal.militarNf} (não resolvido)
                      </span>
                    )}
                    <span className="ml-2 text-xs font-normal opacity-70">
                      NF {previa.fiscal.militarNf}
                      {previa.fiscal.militarResolvido?.ant !== undefined && (
                        <> · ANT {previa.fiscal.militarResolvido.ant}</>
                      )}
                    </span>
                  </p>
                  {previa.fiscal.motivo && (
                    <p className="mt-1 text-xs italic opacity-80">{previa.fiscal.motivo}</p>
                  )}
                </div>
              )}
            </section>

            {previa.inconsistencias.length > 0 && (
              <details className="mt-4 rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                <summary className="cursor-pointer font-semibold">
                  ⚠️ {previa.inconsistencias.length} inconsistência(s) — clique para detalhar
                </summary>
                <ul className="mt-2 space-y-1">
                  {previa.inconsistencias.map((i, idx) => (
                    <li key={idx}>
                      <span className="font-medium">[{INCONSISTENCIA_LABEL[i.tipo]}]</span>{' '}
                      {i.mensagem}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {previa.tripulacao.length > 0 && (
              <section className="mt-4">
                <h3 className="mb-2 text-sm font-semibold text-slate-700">Tripulação</h3>
                <div className="space-y-3">
                  {[...tripulacaoPorViatura.entries()].map(([viatura, linhas]) => (
                    <article key={viatura} className="rounded border border-slate-200 bg-white p-3">
                      <p className="text-sm font-bold text-cbmes-blue">{viatura}</p>
                      <ul className="mt-1 divide-y divide-slate-100 text-sm">
                        {linhas.map((t, i) => (
                          <li
                            key={i}
                            className={`flex items-baseline justify-between gap-2 py-1 ${
                              t.isFiscal ? 'rounded bg-cbmes-red/5 px-2' : ''
                            }`}
                          >
                            <span className="text-xs uppercase text-slate-500">
                              {t.funcao || '—'}
                              {t.isFiscal && (
                                <span className="ml-2 rounded-full bg-cbmes-red px-2 py-0.5 text-[10px] font-bold text-white">
                                  FISCAL
                                </span>
                              )}
                            </span>
                            <span className="text-right">
                              {t.militarResolvido ? (
                                <>
                                  <span className="font-medium">
                                    {t.militarResolvido.posto}{' '}
                                    {t.militarResolvido.nomeGuerra ??
                                      t.militarResolvido.nome.split(' ')[0]}
                                  </span>
                                  <span className="ml-2 text-xs text-slate-500">
                                    NF {t.militarResolvido.nf} · ANT {t.militarResolvido.ant}
                                  </span>
                                </>
                              ) : (
                                <span className="text-feedback-warn">
                                  {t.militarRef.raw} <span className="text-xs">(sem NF)</span>
                                </span>
                              )}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </article>
                  ))}
                </div>
              </section>
            )}

            {previa.ideo.length > 0 && (
              <section className="mt-4">
                <h3 className="mb-2 text-sm font-semibold text-slate-700">
                  IDEO do dia {previa.dia}
                </h3>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {previa.ideo.map((entry) => (
                    <article
                      key={entry.tipo}
                      className="rounded border border-slate-200 bg-white p-3"
                    >
                      <p className="text-sm font-bold text-cbmes-blue">{entry.tipo}</p>
                      <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs text-slate-700">
                        {entry.itens.map((it, i) => (
                          <li key={i}>{it}</li>
                        ))}
                      </ul>
                    </article>
                  ))}
                </div>
              </section>
            )}

            {previa.viaturasOperacionais.length > 0 && (
              <section className="mt-4">
                <h3 className="mb-2 text-sm font-semibold text-slate-700">
                  Viaturas (status do Mapa Força)
                </h3>
                <ul className="grid grid-cols-2 gap-2 text-xs md:grid-cols-3">
                  {previa.viaturasOperacionais.map((v) => {
                    const statusClass =
                      v.vtrStatus === 'operacional'
                        ? 'border-emerald-300 bg-emerald-50'
                        : v.vtrStatus === 'baixada'
                          ? 'border-rose-300 bg-rose-50'
                          : v.vtrStatus === 'reserva'
                            ? 'border-amber-300 bg-amber-50'
                            : 'border-slate-200 bg-white';
                    return (
                      <li key={v.id} className={`rounded border p-2 text-center ${statusClass}`}>
                        <p className="font-bold text-cbmes-blue">{v.codigo}</p>
                        <p className="text-[10px] text-slate-500">{v.descricao}</p>
                        {v.vtrStatus && v.vtrStatus !== 'operacional' && (
                          <p className="mt-0.5 text-[10px] font-bold uppercase text-rose-700">
                            {v.vtrStatus}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            <AjustesPreTurno
              data={data}
              initial={extractAjustes(previa)}
              onSaved={() => {
                // recarrega a Prévia após salvar ajustes
                api
                  .previaDoDia(data)
                  .then(setPrevia)
                  .catch(() => undefined);
              }}
            />

            <p className="mt-4 text-center text-[10px] text-slate-400">
              Gerado em {new Date(previa.geradoEm).toLocaleString('pt-BR')}
            </p>
          </>
        )}
      </section>
    </main>
  );
}

function extractAjustes(previa: PreviaDoDia): AjustesPrevia {
  return {
    trocas: previa.trocas,
    escalaEspecial: previa.escalaEspecial,
    notasServico: previa.notasServico,
    dispensas: previa.dispensas,
  };
}

function AjustesPreTurno({
  data,
  initial,
  onSaved,
}: {
  data: string;
  initial: AjustesPrevia;
  onSaved: () => void;
}) {
  const [state, setState] = useState<AjustesPrevia>(initial);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // sincroniza quando a data muda (depende de `initial` mas evitamos loop usando data como key)
  useEffect(() => {
    setState(initial);
  }, [data, initial]);

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      await fetch(
        `${import.meta.env.VITE_API_URL ?? 'http://localhost:3000'}/previa/${data}/ajustes`,
        {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(state),
        },
      ).then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erro ao salvar ajustes');
    } finally {
      setSaving(false);
    }
  };

  return (
    <details className="mt-4 rounded border border-cbmes-blue/30 bg-white p-3">
      <summary className="cursor-pointer text-sm font-semibold text-cbmes-blue">
        ✏️ Ajustes pré-turno (trocas, escala especial, NS, dispensas)
      </summary>
      <div className="mt-3 space-y-4 text-xs">
        {err && (
          <p
            role="alert"
            className="rounded border border-feedback-error/30 bg-feedback-error/10 p-2 text-feedback-error"
          >
            {err}
          </p>
        )}

        <fieldset className="rounded border border-slate-200 p-2">
          <legend className="px-1 font-medium text-slate-700">Trocas</legend>
          {state.trocas.map((t, i) => (
            <div key={i} className="mt-2 grid grid-cols-1 gap-1 md:grid-cols-4">
              <input
                placeholder="Substituído"
                value={t.substituidoRaw}
                onChange={(e) => {
                  const trocas = [...state.trocas];
                  trocas[i] = { ...trocas[i]!, substituidoRaw: e.target.value };
                  setState({ ...state, trocas });
                }}
                className="rounded border border-slate-300 px-2 py-1"
              />
              <input
                placeholder="Substituto"
                value={t.substitutoRaw}
                onChange={(e) => {
                  const trocas = [...state.trocas];
                  trocas[i] = { ...trocas[i]!, substitutoRaw: e.target.value };
                  setState({ ...state, trocas });
                }}
                className="rounded border border-slate-300 px-2 py-1"
              />
              <input
                placeholder="Período (ex: 24h)"
                value={t.periodo}
                onChange={(e) => {
                  const trocas = [...state.trocas];
                  trocas[i] = { ...trocas[i]!, periodo: e.target.value };
                  setState({ ...state, trocas });
                }}
                className="rounded border border-slate-300 px-2 py-1"
              />
              <button
                type="button"
                onClick={() =>
                  setState({ ...state, trocas: state.trocas.filter((_, j) => j !== i) })
                }
                className="rounded border border-feedback-error px-2 py-1 text-feedback-error"
              >
                Remover
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              setState({
                ...state,
                trocas: [
                  ...state.trocas,
                  { substituidoRaw: '', substitutoRaw: '', periodo: '24h' },
                ],
              })
            }
            className="mt-2 rounded border border-cbmes-blue px-3 py-1 text-cbmes-blue"
          >
            + Adicionar troca
          </button>
        </fieldset>

        <fieldset className="rounded border border-slate-200 p-2">
          <legend className="px-1 font-medium text-slate-700">Escala Especial</legend>
          <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
            <label className="block">
              <span className="text-slate-600">Matutina</span>
              <input
                value={state.escalaEspecial.matutina?.militarRaw ?? ''}
                onChange={(e) =>
                  setState({
                    ...state,
                    escalaEspecial: {
                      ...state.escalaEspecial,
                      matutina: e.target.value ? { militarRaw: e.target.value } : undefined,
                    },
                  })
                }
                placeholder="Ex.: SGT BRUNO MELO"
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1"
              />
            </label>
            <label className="block">
              <span className="text-slate-600">Vespertina</span>
              <input
                value={state.escalaEspecial.vespertina?.militarRaw ?? ''}
                onChange={(e) =>
                  setState({
                    ...state,
                    escalaEspecial: {
                      ...state.escalaEspecial,
                      vespertina: e.target.value ? { militarRaw: e.target.value } : undefined,
                    },
                  })
                }
                placeholder="Ex.: CB ELSON"
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1"
              />
            </label>
          </div>
        </fieldset>

        <fieldset className="rounded border border-slate-200 p-2">
          <legend className="px-1 font-medium text-slate-700">Notas de Serviço</legend>
          {state.notasServico.map((n, i) => (
            <div key={i} className="mt-2 grid grid-cols-1 gap-1 md:grid-cols-3">
              <input
                placeholder="Código (NS072)"
                value={n.codigo}
                onChange={(e) => {
                  const ns = [...state.notasServico];
                  ns[i] = { ...ns[i]!, codigo: e.target.value };
                  setState({ ...state, notasServico: ns });
                }}
                className="rounded border border-slate-300 px-2 py-1"
              />
              <input
                placeholder="Descrição (opcional)"
                value={n.descricao ?? ''}
                onChange={(e) => {
                  const ns = [...state.notasServico];
                  ns[i] = { ...ns[i]!, descricao: e.target.value };
                  setState({ ...state, notasServico: ns });
                }}
                className="rounded border border-slate-300 px-2 py-1"
              />
              <button
                type="button"
                onClick={() =>
                  setState({ ...state, notasServico: state.notasServico.filter((_, j) => j !== i) })
                }
                className="rounded border border-feedback-error px-2 py-1 text-feedback-error"
              >
                Remover
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              setState({ ...state, notasServico: [...state.notasServico, { codigo: '' }] })
            }
            className="mt-2 rounded border border-cbmes-blue px-3 py-1 text-cbmes-blue"
          >
            + Adicionar NS
          </button>
        </fieldset>

        <fieldset className="rounded border border-slate-200 p-2">
          <legend className="px-1 font-medium text-slate-700">Dispensas</legend>
          {state.dispensas.map((d, i) => (
            <div key={i} className="mt-2 grid grid-cols-1 gap-1 md:grid-cols-3">
              <input
                placeholder="Militar (ex.: 2ºSGT HOFFMAM)"
                value={d.militarRaw}
                onChange={(e) => {
                  const ds = [...state.dispensas];
                  ds[i] = { ...ds[i]!, militarRaw: e.target.value };
                  setState({ ...state, dispensas: ds });
                }}
                className="rounded border border-slate-300 px-2 py-1"
              />
              <input
                placeholder="Motivo (opcional)"
                value={d.motivo ?? ''}
                onChange={(e) => {
                  const ds = [...state.dispensas];
                  ds[i] = { ...ds[i]!, motivo: e.target.value };
                  setState({ ...state, dispensas: ds });
                }}
                className="rounded border border-slate-300 px-2 py-1"
              />
              <button
                type="button"
                onClick={() =>
                  setState({ ...state, dispensas: state.dispensas.filter((_, j) => j !== i) })
                }
                className="rounded border border-feedback-error px-2 py-1 text-feedback-error"
              >
                Remover
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              setState({ ...state, dispensas: [...state.dispensas, { militarRaw: '' }] })
            }
            className="mt-2 rounded border border-cbmes-blue px-3 py-1 text-cbmes-blue"
          >
            + Adicionar dispensa
          </button>
        </fieldset>

        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-button bg-cbmes-red px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {saving ? 'Salvando…' : 'Salvar ajustes'}
        </button>
      </div>
    </details>
  );
}

function formatDataExtenso(iso: string): string {
  const [y, m, d] = iso.split('-').map((s) => Number.parseInt(s, 10));
  const date = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
  return date.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

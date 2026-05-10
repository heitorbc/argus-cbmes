import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ESTADO_SERVICO_LABEL,
  type AjustesPrevia,
  type AlteracaoDiversa,
  type EscalaEspecialAtoLight,
  type LetraEquipe,
  type PeriodoTroca,
  type PeriodoTrocaPredefinido,
  type PreviaDoDia,
  type TipoInconsistencia,
  type TrocaEscalaEspecial,
} from '@argus/shared-types';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { formatPreviaParaWhatsapp } from '@/lib/whatsapp';
import { MilitarSelect } from '@/components/militar-select';
import {
  PERIODO_TROCA_DEFAULT,
  PERIODO_TROCA_OPCOES,
  legacyStringToPeriodo,
} from '@/lib/periodo-troca';
import { STATUS_VIATURA_BADGE, STATUS_VIATURA_CARD } from '@/lib/status-viatura-style';

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
  const { user } = useAuth();
  const podeIniciarServico =
    user?.papeis.includes('admin') ||
    user?.papeis.includes('fiscal') ||
    user?.papeis.includes('sargenteante') ||
    false;

  const [data, setData] = useState<string>(todayIso());
  const [previa, setPrevia] = useState<PreviaDoDia | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [servicoActionInflight, setServicoActionInflight] = useState(false);

  const isReadOnly = (previa?.estadoServico ?? 'NAO_INICIADO') !== 'NAO_INICIADO';

  const reload = () => {
    api
      .previaDoDia(data)
      .then(setPrevia)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Erro ao recarregar'));
  };

  const handleIniciarServico = async () => {
    setServicoActionInflight(true);
    setError(null);
    try {
      await api.servicoIniciar(data);
      reload();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erro ao iniciar serviço');
    } finally {
      setServicoActionInflight(false);
    }
  };

  const handleEncerrarServico = async (force = false) => {
    if (!confirm(`Encerrar serviço de ${data}?`)) return;
    setServicoActionInflight(true);
    setError(null);
    try {
      await api.servicoEncerrar(data, force);
      reload();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erro ao encerrar serviço');
    } finally {
      setServicoActionInflight(false);
    }
  };

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

            <ServicoCard
              previa={previa}
              podeIniciar={podeIniciarServico}
              inflight={servicoActionInflight}
              onIniciar={handleIniciarServico}
              onEncerrar={handleEncerrarServico}
              onSaved={reload}
            />

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
                    // S6c/F3 — paleta única; status são DISPONIVEL/BAIXADA/EMPRESTADA (ADR-009)
                    const statusClass =
                      v.vtrStatus && v.vtrStatus in STATUS_VIATURA_CARD
                        ? STATUS_VIATURA_CARD[v.vtrStatus as keyof typeof STATUS_VIATURA_CARD]
                        : 'border-slate-200 bg-white text-slate-700';
                    const badgeClass =
                      v.vtrStatus && v.vtrStatus in STATUS_VIATURA_BADGE
                        ? STATUS_VIATURA_BADGE[v.vtrStatus as keyof typeof STATUS_VIATURA_BADGE]
                        : 'bg-slate-200 text-slate-700';
                    return (
                      <li key={v.id} className={`rounded border-2 p-2 text-center ${statusClass}`}>
                        <p className="font-bold">{v.codigo}</p>
                        <p className="text-[10px] opacity-70">{v.descricao}</p>
                        {v.vtrStatus && v.vtrStatus !== 'DISPONIVEL' && (
                          <span
                            className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${badgeClass}`}
                          >
                            {v.vtrStatus}
                          </span>
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
              atosEspeciais={previa.escalaEspecialAtos}
              chefesOperacoes={previa.chefesOperacoes}
              isReadOnly={isReadOnly}
              onSaved={reload}
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
    trocasEscalaEspecial: previa.trocasEscalaEspecial,
  };
}

function atoKey(a: EscalaEspecialAtoLight): string {
  return `${a.data}|${a.militarRaw}|${a.horario}|${a.funcao}`;
}

function AjustesPreTurno({
  data,
  initial,
  atosEspeciais,
  chefesOperacoes,
  isReadOnly,
  onSaved,
}: {
  data: string;
  isReadOnly: boolean;
  initial: AjustesPrevia;
  atosEspeciais: EscalaEspecialAtoLight[];
  chefesOperacoes: PreviaDoDia['chefesOperacoes'];
  onSaved: () => void;
}) {
  const [state, setState] = useState<AjustesPrevia>(initial);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [modalAto, setModalAto] = useState<EscalaEspecialAtoLight | null>(null);

  // sincroniza quando a data muda
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

  const removerTrocaEspecial = async (ato: EscalaEspecialAtoLight) => {
    try {
      await api.previaRemoveTrocaEscalaEspecial(data, atoKey(ato));
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erro ao remover troca');
    }
  };

  const trocasPorAto = new Map<string, TrocaEscalaEspecial>();
  for (const t of state.trocasEscalaEspecial) trocasPorAto.set(atoKey(t.atoOriginal), t);

  return (
    <>
      {chefesOperacoes.length > 0 && (
        <section className="mt-4 rounded border border-slate-200 bg-white p-3">
          <h3 className="mb-2 text-sm font-semibold text-slate-700">
            Chefe de Operações (escalados no dia)
          </h3>
          <ul className="divide-y divide-slate-100 text-sm">
            {chefesOperacoes.map((c) => (
              <li key={c.nf} className="flex items-baseline justify-between gap-2 py-1">
                <span>
                  <strong>{c.posto}</strong> {c.nomeGuerra}
                  {c.marcador && (
                    <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">
                      {c.marcador}
                    </span>
                  )}
                </span>
                <span className="text-xs text-slate-500">
                  NF {c.nf}
                  {c.telefone && <> · 📞 {c.telefone}</>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {isReadOnly && (
        <p className="mt-4 rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          🔒 Ajustes pré-turno bloqueados — Serviço já iniciado. Para mudanças durante o serviço,
          use as Conferências ou registre uma <strong>Alteração Diversa</strong> abaixo.
        </p>
      )}

      <details
        className={`mt-4 rounded border border-cbmes-blue/30 bg-white p-3 ${isReadOnly ? 'opacity-60' : ''}`}
      >
        <summary className="cursor-pointer text-sm font-semibold text-cbmes-blue">
          ✏️ Ajustes pré-turno (trocas, escala especial, NS, dispensas){' '}
          {isReadOnly && <span className="text-xs text-amber-700">— Bloqueado</span>}
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
              <div
                key={i}
                className="mt-2 grid grid-cols-1 items-end gap-2 md:grid-cols-[1fr,1fr,120px,auto]"
              >
                <div>
                  <p className="text-[10px] text-slate-500">Substituído</p>
                  <MilitarSelect
                    value={t.substituidoNf}
                    valueRaw={t.substituidoRaw}
                    onChange={(nf, m) => {
                      const trocas = [...state.trocas];
                      trocas[i] = {
                        ...trocas[i]!,
                        substituidoNf: nf ?? undefined,
                        substituidoRaw: m
                          ? `${m.posto} ${m.nomeGuerra ?? m.nome.split(' ')[0]}`
                          : '',
                      };
                      setState({ ...state, trocas });
                    }}
                    placeholder="Substituído"
                    excluirNfs={t.substitutoNf ? [t.substitutoNf] : []}
                  />
                </div>
                <div>
                  <p className="text-[10px] text-slate-500">Substituto</p>
                  <MilitarSelect
                    value={t.substitutoNf}
                    valueRaw={t.substitutoRaw}
                    onChange={(nf, m) => {
                      const trocas = [...state.trocas];
                      trocas[i] = {
                        ...trocas[i]!,
                        substitutoNf: nf ?? undefined,
                        substitutoRaw: m
                          ? `${m.posto} ${m.nomeGuerra ?? m.nome.split(' ')[0]}`
                          : '',
                      };
                      setState({ ...state, trocas });
                    }}
                    placeholder="Substituto"
                    excluirNfs={t.substituidoNf ? [t.substituidoNf] : []}
                  />
                </div>
                <PeriodoTrocaPicker
                  value={t.periodo}
                  onChange={(periodo) => {
                    const trocas = [...state.trocas];
                    trocas[i] = { ...trocas[i]!, periodo };
                    setState({ ...state, trocas });
                  }}
                />
                <button
                  type="button"
                  onClick={() =>
                    setState({ ...state, trocas: state.trocas.filter((_, j) => j !== i) })
                  }
                  className="self-end rounded border border-feedback-error px-2 py-2 text-feedback-error"
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
                    { substituidoRaw: '', substitutoRaw: '', periodo: PERIODO_TROCA_DEFAULT },
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
            {atosEspeciais.length === 0 ? (
              <p className="mt-2 text-slate-500">
                Nenhum ato de Escala Especial importado para este dia. Importe o XLSM em{' '}
                <Link to="/cadastros/escalas-especiais" className="text-cbmes-blue underline">
                  /cadastros/escalas-especiais
                </Link>
                .
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-slate-100">
                {atosEspeciais.map((a) => {
                  const key = atoKey(a);
                  const troca = trocasPorAto.get(key);
                  return (
                    <li key={key} className="py-2">
                      <div className="flex items-baseline justify-between gap-2">
                        <span>
                          {troca ? (
                            <>
                              <s className="text-slate-400">{a.militarRaw}</s> →{' '}
                              <strong className="text-cbmes-blue">{troca.substitutoRaw}</strong>
                            </>
                          ) : (
                            <strong>{a.militarRaw}</strong>
                          )}
                          <span className="ml-2 text-slate-500">
                            {a.horario} · {a.funcao}
                          </span>
                        </span>
                        {troca ? (
                          <button
                            type="button"
                            onClick={() => removerTrocaEspecial(a)}
                            className="rounded border border-feedback-error px-2 py-1 text-feedback-error"
                          >
                            Desfazer troca
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setModalAto(a)}
                            className="rounded border border-cbmes-blue px-2 py-1 text-cbmes-blue"
                          >
                            Registrar Troca
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
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
                    setState({
                      ...state,
                      notasServico: state.notasServico.filter((_, j) => j !== i),
                    })
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
              <div
                key={i}
                className="mt-2 grid grid-cols-1 items-end gap-2 md:grid-cols-[1fr,1fr,auto]"
              >
                <div>
                  <p className="text-[10px] text-slate-500">Militar</p>
                  <MilitarSelect
                    value={d.militarNf}
                    valueRaw={d.militarRaw}
                    onChange={(nf, m) => {
                      const ds = [...state.dispensas];
                      ds[i] = {
                        ...ds[i]!,
                        militarNf: nf ?? undefined,
                        militarRaw: m ? `${m.posto} ${m.nomeGuerra ?? m.nome.split(' ')[0]}` : '',
                      };
                      setState({ ...state, dispensas: ds });
                    }}
                    placeholder="Selecione o militar"
                  />
                </div>
                <input
                  placeholder="Motivo (opcional)"
                  value={d.motivo ?? ''}
                  onChange={(e) => {
                    const ds = [...state.dispensas];
                    ds[i] = { ...ds[i]!, motivo: e.target.value };
                    setState({ ...state, dispensas: ds });
                  }}
                  className="rounded border border-slate-300 px-2 py-2"
                />
                <button
                  type="button"
                  onClick={() =>
                    setState({ ...state, dispensas: state.dispensas.filter((_, j) => j !== i) })
                  }
                  className="self-end rounded border border-feedback-error px-2 py-2 text-feedback-error"
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

      {modalAto && (
        <ModalTrocaEscalaEspecial
          ato={modalAto}
          data={data}
          onSaved={() => {
            setModalAto(null);
            onSaved();
          }}
          onCancel={() => setModalAto(null)}
        />
      )}
    </>
  );
}

function ModalTrocaEscalaEspecial({
  ato,
  data,
  onSaved,
  onCancel,
}: {
  ato: EscalaEspecialAtoLight;
  data: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [substitutoNf, setSubstitutoNf] = useState<string | undefined>();
  const [substitutoRaw, setSubstitutoRaw] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!substitutoRaw && !substitutoNf) {
      setErr('Selecione o militar substituto.');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await api.previaAddTrocaEscalaEspecial(data, {
        atoOriginal: ato,
        substituidoRaw: ato.militarRaw,
        substitutoRaw,
        substitutoNf,
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Erro ao registrar troca');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-troca-titulo"
    >
      <div className="w-full max-w-lg rounded border border-slate-200 bg-white p-4 shadow-xl">
        <h3 id="modal-troca-titulo" className="text-base font-bold text-cbmes-blue">
          Registrar Troca de Escala Especial
        </h3>

        <div className="mt-3 rounded bg-slate-50 p-3 text-xs">
          <p className="font-semibold text-slate-700">Ato original</p>
          <p className="mt-1">
            <strong>{ato.militarRaw}</strong> — {ato.horario} · <em>{ato.funcao}</em>
          </p>
          <p className="text-slate-500">{ato.data}</p>
        </div>

        <div className="mt-3">
          <label className="text-xs font-medium text-slate-700">Substituto</label>
          <div className="mt-1">
            <MilitarSelect
              value={substitutoNf}
              valueRaw={substitutoRaw}
              onChange={(nf, m) => {
                setSubstitutoNf(nf ?? undefined);
                setSubstitutoRaw(m ? `${m.posto} ${m.nomeGuerra ?? m.nome.split(' ')[0]}` : '');
              }}
              placeholder="Selecione o militar substituto"
            />
          </div>
        </div>

        {err && (
          <p
            role="alert"
            className="mt-3 rounded border border-feedback-error/30 bg-feedback-error/10 p-2 text-xs text-feedback-error"
          >
            {err}
          </p>
        )}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="flex-1 rounded-button bg-cbmes-red py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="flex-1 rounded-button border border-slate-300 bg-white py-2 text-sm text-slate-700"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
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

// ════════════════════════════════════════════════════════════════════════════
// S6b — ServicoCard: estado do dia + Conferências + Alterações Diversas
// ════════════════════════════════════════════════════════════════════════════

function ServicoCard({
  previa,
  podeIniciar,
  inflight,
  onIniciar,
  onEncerrar,
  onSaved,
}: {
  previa: PreviaDoDia;
  podeIniciar: boolean;
  inflight: boolean;
  onIniciar: () => Promise<void>;
  onEncerrar: (force?: boolean) => Promise<void>;
  onSaved: () => void;
}) {
  const estado = previa.estadoServico;
  const isEncerrado = estado === 'ENCERRADO';
  const podePreencherMf = estado === 'VIATURA_CONFERIDA';
  const [preenchendoMf, setPreenchendoMf] = useState(false);
  const [mfMsg, setMfMsg] = useState<string | null>(null);

  const handlePreencherMf = async () => {
    if (!confirm('Iniciar preenchimento do Mapa Força? (mock — escrita real chega no S9)')) return;
    setPreenchendoMf(true);
    setMfMsg(null);
    try {
      const r = await api.servicoPreencherMf(previa.data);
      setMfMsg(r.mensagem);
      onSaved();
    } catch (e) {
      setMfMsg(e instanceof ApiError ? e.message : 'Erro ao iniciar preenchimento do MF');
    } finally {
      setPreenchendoMf(false);
    }
  };

  if (estado === 'NAO_INICIADO') {
    if (!podeIniciar) return null;
    return (
      <section className="mt-4 rounded border border-cbmes-blue/30 bg-cbmes-blue/5 p-3">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-cbmes-blue">Serviço do dia</h3>
            <p className="text-xs text-slate-600">
              Estado: <strong>{ESTADO_SERVICO_LABEL[estado]}</strong> — clique para iniciar e
              começar as Conferências.
            </p>
          </div>
          <button
            type="button"
            onClick={onIniciar}
            disabled={inflight}
            className="rounded-button bg-cbmes-red px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {inflight ? '…' : 'Iniciar Serviço'}
          </button>
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="mt-4 rounded border border-amber-300 bg-amber-50 p-3 text-amber-900">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">⚠️ Serviço {ESTADO_SERVICO_LABEL[estado]}</h3>
            <p className="text-xs">
              {previa.iniciadoEm && (
                <>
                  Iniciado em <strong>{new Date(previa.iniciadoEm).toLocaleString('pt-BR')}</strong>
                  {previa.iniciadoPorNf && <> por NF {previa.iniciadoPorNf}</>}.{' '}
                </>
              )}
              {isEncerrado && previa.encerradoEm && (
                <>
                  Encerrado em{' '}
                  <strong>{new Date(previa.encerradoEm).toLocaleString('pt-BR')}</strong>
                  {previa.encerradoPorNf && <> por NF {previa.encerradoPorNf}</>}.{' '}
                </>
              )}
              {!isEncerrado && (
                <>Edição da Prévia bloqueada. Use Conferências e Alterações Diversas.</>
              )}
            </p>
          </div>
          {!isEncerrado && podeIniciar && (
            <button
              type="button"
              onClick={() => onEncerrar(false)}
              disabled={inflight}
              className="rounded-button bg-cbmes-red px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
            >
              Encerrar Serviço
            </button>
          )}
        </div>
      </section>

      {!isEncerrado && (
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <Link
            to={`/servico/${previa.data}/conferencia-equipe`}
            className="block rounded border border-cbmes-blue/30 bg-white p-3 hover:bg-cbmes-blue/5"
          >
            <h4 className="text-sm font-semibold text-cbmes-blue">👥 Conferência da Equipe</h4>
            <p className="mt-1 text-xs text-slate-600">
              Marcar presença/substituição/ausência da equipe escalada.
            </p>
          </Link>
          <ConferenciaViaturasMenu data={previa.data} composicaoMf={previa.composicaoMf} />
        </div>
      )}

      {/* S6h/2.1 — Botão "Preencher Mapa Força" (mock até S9) */}
      {podePreencherMf && podeIniciar && (
        <section className="mt-3 rounded border-2 border-emerald-500 bg-emerald-50 p-3">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-emerald-900">
                ✓ Equipes e viaturas conferidas
              </h3>
              <p className="text-xs text-emerald-800">
                Pronto para preencher o Mapa Força. (Escrita automatizada chega no S9.)
              </p>
            </div>
            <button
              type="button"
              onClick={handlePreencherMf}
              disabled={preenchendoMf}
              className="rounded-button bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {preenchendoMf ? 'Preenchendo…' : '🗺️ Preencher Mapa Força'}
            </button>
          </div>
        </section>
      )}
      {mfMsg && (
        <div className="mt-2 rounded border border-emerald-300 bg-emerald-50 p-2 text-xs text-emerald-900">
          {mfMsg}
        </div>
      )}

      <AlteracoesDiversasCard
        data={previa.data}
        alteracoes={previa.alteracoesDiversas}
        composicaoMf={previa.composicaoMf}
        canRegistrar={!isEncerrado && podeIniciar}
        onSaved={onSaved}
      />
    </>
  );
}

function ConferenciaViaturasMenu({
  data,
  composicaoMf,
}: {
  data: string;
  composicaoMf: PreviaDoDia['composicaoMf'];
}) {
  const viaturas = composicaoMf
    .filter((c) => c.vtrPrefixo && c.vtrStatus === 'DISPONIVEL')
    .map((c) => c.vtrPrefixo!);

  return (
    <div className="rounded border border-cbmes-blue/30 bg-white p-3">
      <h4 className="text-sm font-semibold text-cbmes-blue">🚒 Conferência das Viaturas</h4>
      {viaturas.length === 0 ? (
        <p className="mt-1 text-xs text-slate-500">Nenhuma viatura disponível para conferir.</p>
      ) : (
        <ul className="mt-2 flex flex-wrap gap-1">
          {viaturas.map((v) => (
            <li key={v}>
              <Link
                to={`/servico/${data}/conferencia-viatura/${encodeURIComponent(v)}`}
                className="rounded-button border border-cbmes-blue px-2 py-1 text-xs text-cbmes-blue hover:bg-cbmes-blue/10"
              >
                {v}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AlteracoesDiversasCard({
  data,
  alteracoes,
  composicaoMf,
  canRegistrar,
  onSaved,
}: {
  data: string;
  alteracoes: AlteracaoDiversa[];
  composicaoMf: PreviaDoDia['composicaoMf'];
  canRegistrar: boolean;
  onSaved: () => void;
}) {
  const [modalAberto, setModalAberto] = useState(false);

  return (
    <>
      <section className="mt-4 rounded border border-cbmes-blue/30 bg-white p-3">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-semibold text-cbmes-blue">📝 Alterações Diversas</h3>
          {canRegistrar && (
            <button
              type="button"
              onClick={() => setModalAberto(true)}
              className="rounded-button border border-cbmes-blue px-2 py-1 text-xs text-cbmes-blue hover:bg-cbmes-blue/10"
            >
              + Registrar alteração
            </button>
          )}
        </div>
        {alteracoes.length === 0 ? (
          <p className="mt-1 text-xs text-slate-500">Nenhuma alteração registrada.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100 text-xs">
            {[...alteracoes].reverse().map((a) => (
              <li key={a.id} className="py-1">
                <span className="text-slate-500">
                  [{new Date(a.registradoEm).toLocaleString('pt-BR')} · NF {a.registradoPorNf}]
                </span>{' '}
                <strong>{tipoLabel(a.tipo)}</strong>
                {a.recurso && <> · {a.recurso}</>}
                {a.funcao && <> ({a.funcao})</>}
                {a.militarOriginalRaw && a.militarSubstitutoRaw && (
                  <>
                    {' '}
                    — {a.militarOriginalRaw} → <strong>{a.militarSubstitutoRaw}</strong>
                  </>
                )}
                {a.vtrPrefixo && a.statusViaturaNovo && (
                  <>
                    {' '}
                    — {a.vtrPrefixo}: {a.statusViaturaAnterior} → {a.statusViaturaNovo}
                  </>
                )}
                {a.observacao && <> — {a.observacao}</>}
                {a.motivo && <em className="text-slate-500"> ({a.motivo})</em>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {modalAberto && (
        <ModalAlteracaoDiversa
          data={data}
          composicaoMf={composicaoMf}
          onSaved={() => {
            setModalAberto(false);
            onSaved();
          }}
          onCancel={() => setModalAberto(false)}
        />
      )}
    </>
  );
}

function tipoLabel(tipo: AlteracaoDiversa['tipo']): string {
  if (tipo === 'troca_militar') return 'Troca de militar';
  if (tipo === 'mudanca_viatura') return 'Mudança de viatura';
  return 'Observação';
}

function ModalAlteracaoDiversa({
  data,
  composicaoMf,
  onSaved,
  onCancel,
}: {
  data: string;
  composicaoMf: PreviaDoDia['composicaoMf'];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [tipo, setTipo] = useState<AlteracaoDiversa['tipo']>('troca_militar');
  const [recurso, setRecurso] = useState('');
  const [funcao, setFuncao] = useState('');
  const [militarOriginalNf, setMilitarOriginalNf] = useState<string | undefined>();
  const [militarOriginalRaw, setMilitarOriginalRaw] = useState('');
  const [militarSubstitutoNf, setMilitarSubstitutoNf] = useState<string | undefined>();
  const [militarSubstitutoRaw, setMilitarSubstitutoRaw] = useState('');
  const [motivo, setMotivo] = useState('');
  const [observacao, setObservacao] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const recursos = composicaoMf.map((c) => c.recurso);

  const submit = async () => {
    setSaving(true);
    setErr(null);
    try {
      await api.alteracoesDiversasAdd(data, {
        tipo,
        recurso: recurso || undefined,
        funcao: funcao || undefined,
        militarOriginalNf,
        militarOriginalRaw: militarOriginalRaw || undefined,
        militarSubstitutoNf,
        militarSubstitutoRaw: militarSubstitutoRaw || undefined,
        motivo: motivo || undefined,
        observacao: observacao || undefined,
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Erro ao registrar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-lg rounded border border-slate-200 bg-white p-4 shadow-xl">
        <h3 className="text-base font-bold text-cbmes-blue">Registrar Alteração Diversa</h3>

        <div className="mt-3 space-y-3 text-sm">
          <label className="block">
            <span className="text-xs font-medium text-slate-700">Tipo</span>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as AlteracaoDiversa['tipo'])}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
            >
              <option value="troca_militar">Troca de militar</option>
              <option value="mudanca_viatura">Mudança de viatura</option>
              <option value="observacao">Observação geral</option>
            </select>
          </label>

          {(tipo === 'troca_militar' || tipo === 'mudanca_viatura') && (
            <label className="block">
              <span className="text-xs font-medium text-slate-700">Recurso afetado</span>
              <select
                value={recurso}
                onChange={(e) => setRecurso(e.target.value)}
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
              >
                <option value="">— Selecionar —</option>
                {recursos.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
          )}

          {tipo === 'troca_militar' && (
            <>
              <label className="block">
                <span className="text-xs font-medium text-slate-700">Função afetada</span>
                <input
                  type="text"
                  value={funcao}
                  onChange={(e) => setFuncao(e.target.value)}
                  placeholder="Ex.: Op1, Mot, Ch"
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
                />
              </label>
              <div>
                <span className="text-xs font-medium text-slate-700">Militar original</span>
                <MilitarSelect
                  value={militarOriginalNf}
                  valueRaw={militarOriginalRaw}
                  onChange={(nf, m) => {
                    setMilitarOriginalNf(nf ?? undefined);
                    setMilitarOriginalRaw(
                      m ? `${m.posto} ${m.nomeGuerra ?? m.nome.split(' ')[0]}` : '',
                    );
                  }}
                  excluirNfs={militarSubstitutoNf ? [militarSubstitutoNf] : []}
                />
              </div>
              <div>
                <span className="text-xs font-medium text-slate-700">Substituto</span>
                <MilitarSelect
                  value={militarSubstitutoNf}
                  valueRaw={militarSubstitutoRaw}
                  onChange={(nf, m) => {
                    setMilitarSubstitutoNf(nf ?? undefined);
                    setMilitarSubstitutoRaw(
                      m ? `${m.posto} ${m.nomeGuerra ?? m.nome.split(' ')[0]}` : '',
                    );
                  }}
                  excluirNfs={militarOriginalNf ? [militarOriginalNf] : []}
                />
              </div>
            </>
          )}

          <label className="block">
            <span className="text-xs font-medium text-slate-700">Motivo (opcional)</span>
            <input
              type="text"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-slate-700">Observação (opcional)</span>
            <textarea
              rows={2}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5"
            />
          </label>

          {err && (
            <p
              role="alert"
              className="rounded border border-feedback-error/30 bg-feedback-error/10 p-2 text-xs text-feedback-error"
            >
              {err}
            </p>
          )}
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="flex-1 rounded-button bg-cbmes-red py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="flex-1 rounded-button border border-slate-300 bg-white py-2 text-sm text-slate-700"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * S6h/1.1 — Picker de período da troca. Combobox com 5 predefinidos +
 * "Personalizado" (com hora início/fim). Aceita string legacy e normaliza.
 */
function PeriodoTrocaPicker({
  value,
  onChange,
}: {
  value: string | PeriodoTroca;
  onChange: (next: PeriodoTroca) => void;
}) {
  const normalizado: PeriodoTroca =
    typeof value === 'string' ? (legacyStringToPeriodo(value) ?? PERIODO_TROCA_DEFAULT) : value;
  const tipoSelecionado: PeriodoTrocaPredefinido | 'custom' =
    normalizado.tipo === 'custom' ? 'custom' : normalizado.valor;
  return (
    <div className="flex flex-col gap-1">
      <select
        value={tipoSelecionado}
        onChange={(e) => {
          const v = e.target.value;
          if (v === 'custom') {
            onChange({ tipo: 'custom', horaInicio: '07:10', horaFim: '19:10' });
          } else {
            onChange({ tipo: 'predefinido', valor: v as PeriodoTrocaPredefinido });
          }
        }}
        className="rounded border border-slate-300 px-2 py-2 text-sm"
      >
        {PERIODO_TROCA_OPCOES.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
        <option value="custom">Personalizado…</option>
      </select>
      {normalizado.tipo === 'custom' && (
        <div className="flex gap-2">
          <input
            type="time"
            value={normalizado.horaInicio}
            onChange={(e) =>
              onChange({ tipo: 'custom', horaInicio: e.target.value, horaFim: normalizado.horaFim })
            }
            className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
            aria-label="Hora início"
          />
          <span className="self-center text-xs text-slate-500">às</span>
          <input
            type="time"
            value={normalizado.horaFim}
            onChange={(e) =>
              onChange({
                tipo: 'custom',
                horaInicio: normalizado.horaInicio,
                horaFim: e.target.value,
              })
            }
            className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
            aria-label="Hora fim"
          />
        </div>
      )}
    </div>
  );
}

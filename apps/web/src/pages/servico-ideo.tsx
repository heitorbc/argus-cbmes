import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  ESTADO_IDEO,
  ESTADO_IDEO_LABEL,
  TIPO_IDEO,
  gerarTextoFiscalAtestadoIdeo,
  type EstadoIdeo,
  type IdeoEquipamentoAlteracao,
  type IdeoStatusDoDia,
  type MapaForcaDoDia,
  type TipoIdeo,
} from '@argus/shared-types';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

/**
 * S6i + S0.x — Tela do Chefe (ABTS/RESGATE) para atestar IDEO no dia.
 *
 * 4 estados por tipo:
 *  - PENDENTE
 *  - REALIZADA_SEM_ALTERACAO (sem campos extras)
 *  - REALIZADA_COM_ALTERACAO: lista equipamentos previstos no IdeoEntry do
 *    dia com checkbox + textarea por item alterado
 *  - NAO_REALIZADA: textarea de motivo geral
 *
 * Permission: Chefe escalado de algum recurso ABTS_xx pode atestar IDEO ABTS;
 * idem RESGATE. Admin/Fiscal/Sargenteante override.
 */
export function ServicoIdeoPage() {
  const { data } = useParams<{ data: string }>();
  const [searchParams] = useSearchParams();
  const tipoFocoParam = searchParams.get('tipo');
  const tipoFoco: TipoIdeo | null =
    tipoFocoParam === 'ABTS' || tipoFocoParam === 'RESGATE' ? tipoFocoParam : null;
  const { user } = useAuth();

  const [previa, setPrevia] = useState<MapaForcaDoDia | null>(null);
  const [statusByTipo, setStatusByTipo] = useState<Record<TipoIdeo, IdeoStatusForm>>(emptyForm());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<TipoIdeo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([api.mapaForcaDoDia(data), api.ideoStatusGet(data)])
      .then(([p, statuses]) => {
        if (cancelled) return;
        setPrevia(p);
        setStatusByTipo(buildFormFromStatuses(statuses, p));
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof ApiError ? e.message : 'Erro ao carregar IDEO');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [data]);

  const fiscalParaTexto = useMemo(() => {
    const m = previa?.fiscal?.militarResolvido;
    if (!m) return null;
    return { posto: m.posto, nomeGuerra: m.nomeGuerra ?? m.nome, nf: m.nf };
  }, [previa]);

  const previewTexto = useMemo(() => {
    const statuses: IdeoStatusDoDia[] = TIPO_IDEO.filter((t) => statusByTipo[t].marcado).map(
      (t) => ({
        data: data!,
        tipo: t,
        estado: statusByTipo[t].estado,
        equipamentos: statusByTipo[t].equipamentos
          .filter((e) => e.alteracao && e.descricao.trim())
          .map((e) => ({ item: e.item, descricao: e.descricao.trim() })),
        motivoNaoRealizacao:
          statusByTipo[t].estado === 'NAO_REALIZADA'
            ? statusByTipo[t].motivoNaoRealizacao
            : undefined,
        atestadoPorNf: fiscalParaTexto?.nf ?? '',
        geradoEm: new Date().toISOString(),
      }),
    );
    return gerarTextoFiscalAtestadoIdeo(statuses, fiscalParaTexto);
  }, [data, statusByTipo, fiscalParaTexto]);

  if (!data) return <p>Data inválida.</p>;
  if (!user) return null;

  // Identificação do tipo que o usuário pode atestar (composicaoMf):
  // Chefe escalado de qualquer ABTS_xx → pode atestar IDEO ABTS
  // Chefe escalado de qualquer Resgate xx → pode atestar IDEO RESGATE
  // Admin/Fiscal/Sargenteante → override (qualquer tipo).
  const isOverride =
    user.papeis.includes('admin') ||
    user.papeis.includes('fiscal') ||
    user.papeis.includes('sargenteante');
  const recursosUsuario =
    previa?.composicaoMf
      .filter((c) => c.chefe?.militarResolvido?.nf === user.nf)
      .map((c) => c.recurso.toUpperCase()) ?? [];
  const podeAtestarTipo = (tipo: TipoIdeo): boolean => {
    if (isOverride) return true;
    const r = tipo === 'ABTS' ? 'ABTS' : 'RESGATE';
    return recursosUsuario.some((rec) => rec.replace(/[\s_]/g, '').startsWith(r));
  };

  const handleSalvar = async (tipo: TipoIdeo) => {
    if (!data) return;
    const f = statusByTipo[tipo];
    if (f.estado === 'NAO_REALIZADA' && !f.motivoNaoRealizacao.trim()) {
      setError(`Motivo é obrigatório quando IDEO ${tipo} não foi realizada.`);
      return;
    }
    if (f.estado === 'REALIZADA_COM_ALTERACAO') {
      const algumComDescricao = f.equipamentos.some((e) => e.alteracao && e.descricao.trim());
      if (!algumComDescricao) {
        setError(
          `Selecione pelo menos 1 equipamento com descrição da alteração para IDEO ${tipo}.`,
        );
        return;
      }
    }
    setSaving(tipo);
    setError(null);
    setSavedMsg(null);
    try {
      const r = await api.ideoStatusUpsert(data, {
        tipo,
        estado: f.estado,
        equipamentos:
          f.estado === 'REALIZADA_COM_ALTERACAO'
            ? f.equipamentos
                .filter((e) => e.alteracao && e.descricao.trim())
                .map((e) => ({ item: e.item, descricao: e.descricao.trim() }))
            : undefined,
        motivoNaoRealizacao:
          f.estado === 'NAO_REALIZADA' ? f.motivoNaoRealizacao.trim() : undefined,
      });
      setStatusByTipo((prev) => ({ ...prev, [tipo]: { ...prev[tipo], marcado: true } }));
      setSavedMsg(`IDEO ${tipo} atestada por NF ${r.atestadoPorNf}.`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : `Erro ao salvar IDEO ${tipo}`);
    } finally {
      setSaving(null);
    }
  };

  const tiposParaRenderizar = tipoFoco ? [tipoFoco] : TIPO_IDEO;

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-cbmes-red px-4 py-4 text-white">
        <Link to={`/mapa-forca/${data}`} className="text-sm opacity-90 hover:opacity-100">
          ← Voltar ao Mapa Força
        </Link>
        <h1 className="mt-1 text-lg font-bold">Inspeção Diária de Equipamentos (IDEO)</h1>
        <p className="text-xs opacity-90">{data} · Atestado pelo Chefe escalado (ABTS/RESGATE)</p>
      </header>

      <section className="mx-auto max-w-3xl p-4">
        {loading && <p className="text-sm text-slate-500">Carregando…</p>}
        {error && (
          <div
            role="alert"
            className="mt-2 rounded border border-feedback-error/30 bg-feedback-error/10 p-3 text-sm text-feedback-error"
          >
            {error}
          </div>
        )}
        {savedMsg && (
          <div className="mt-2 rounded border border-emerald-300 bg-emerald-50 p-2 text-xs text-emerald-900">
            {savedMsg}
          </div>
        )}

        <div className="mt-3 space-y-3">
          {tiposParaRenderizar.map((tipo) => {
            const f = statusByTipo[tipo];
            const itensCadastrados = previa?.ideo.find((i) => i.tipo === tipo)?.itens ?? [];
            const podeEditar = podeAtestarTipo(tipo);
            return (
              <div
                key={tipo}
                className={`rounded border-2 p-3 ${corCardEstado(f.estado, f.marcado)}`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-base font-bold text-cbmes-blue">IDEO {tipo}</h3>
                  {f.marcado && (
                    <span className="rounded-full bg-cbmes-blue/10 px-3 py-0.5 text-xs font-bold uppercase text-cbmes-blue">
                      {ESTADO_IDEO_LABEL[f.estado]}
                    </span>
                  )}
                </div>
                {itensCadastrados.length > 0 && (
                  <p className="mt-1 text-[11px] text-slate-600">
                    Itens cadastrados: {itensCadastrados.join(' · ')}
                  </p>
                )}
                {!podeEditar && (
                  <p className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
                    Você não é Chefe escalado de nenhum recurso {tipo} neste dia (somente leitura).
                  </p>
                )}

                <fieldset disabled={!podeEditar} className="mt-3 space-y-2">
                  <legend className="sr-only">Estado da IDEO {tipo}</legend>
                  {ESTADO_IDEO.filter((e) => e !== 'PENDENTE').map((e) => (
                    <label key={e} className="flex items-start gap-2 text-sm">
                      <input
                        type="radio"
                        name={`estado-${tipo}`}
                        value={e}
                        checked={f.estado === e}
                        onChange={() =>
                          setStatusByTipo((prev) => ({
                            ...prev,
                            [tipo]: { ...prev[tipo], estado: e },
                          }))
                        }
                        className="mt-1 h-4 w-4"
                      />
                      <span>{ESTADO_IDEO_LABEL[e]}</span>
                    </label>
                  ))}
                </fieldset>

                {f.estado === 'NAO_REALIZADA' && podeEditar && (
                  <textarea
                    rows={2}
                    value={f.motivoNaoRealizacao}
                    onChange={(e) =>
                      setStatusByTipo((prev) => ({
                        ...prev,
                        [tipo]: { ...prev[tipo], motivoNaoRealizacao: e.target.value },
                      }))
                    }
                    placeholder={`Motivo da não realização da IDEO ${tipo} (obrigatório)`}
                    required
                    className="mt-2 w-full rounded border border-slate-300 px-2 py-2 text-sm"
                  />
                )}

                {f.estado === 'REALIZADA_COM_ALTERACAO' && podeEditar && (
                  <div className="mt-2 space-y-1.5 rounded border border-slate-200 bg-white/60 p-2">
                    <p className="text-xs font-semibold text-slate-700">
                      Equipamentos com alteração:
                    </p>
                    {f.equipamentos.length === 0 && (
                      <p className="text-xs italic text-slate-500">
                        Nenhum item cadastrado para este tipo no dia. Adicione itens em
                        /cadastros/ideo.
                      </p>
                    )}
                    {f.equipamentos.map((eq, idx) => (
                      <div
                        key={`${tipo}-${eq.item}-${idx}`}
                        className="flex flex-col gap-1 rounded border border-slate-200 p-1.5"
                      >
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={eq.alteracao}
                            onChange={(e) =>
                              setStatusByTipo((prev) => ({
                                ...prev,
                                [tipo]: {
                                  ...prev[tipo],
                                  equipamentos: prev[tipo].equipamentos.map((it, i) =>
                                    i === idx ? { ...it, alteracao: e.target.checked } : it,
                                  ),
                                },
                              }))
                            }
                            className="h-4 w-4"
                          />
                          <span className="font-medium">{eq.item}</span>
                        </label>
                        {eq.alteracao && (
                          <textarea
                            rows={1}
                            value={eq.descricao}
                            onChange={(e) =>
                              setStatusByTipo((prev) => ({
                                ...prev,
                                [tipo]: {
                                  ...prev[tipo],
                                  equipamentos: prev[tipo].equipamentos.map((it, i) =>
                                    i === idx ? { ...it, descricao: e.target.value } : it,
                                  ),
                                },
                              }))
                            }
                            placeholder="Descreva a alteração observada"
                            className="ml-6 rounded border border-slate-300 px-2 py-1 text-xs"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {podeEditar && (
                  <button
                    type="button"
                    onClick={() => handleSalvar(tipo)}
                    disabled={saving === tipo}
                    className="mt-3 rounded-button bg-cbmes-red px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {saving === tipo ? 'Salvando…' : `Atestar IDEO ${tipo}`}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {previewTexto && (
          <section className="mt-5 rounded border border-cbmes-blue/30 bg-cbmes-blue/5 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-cbmes-blue">
              Preview do texto institucional (Parte Diária)
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
              {previewTexto}
            </p>
          </section>
        )}

        {!fiscalParaTexto && previa && (
          <p className="mt-3 rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
            ⚠ Fiscal não definido para este dia (cadastre em /cadastros/fiscais ou aguarde o cálculo
            automático). O texto institucional só é gerado quando o Fiscal está definido.
          </p>
        )}
      </section>
    </main>
  );
}

interface IdeoStatusForm {
  marcado: boolean; // se já foi salvo no backend
  estado: EstadoIdeo;
  motivoNaoRealizacao: string;
  /** Cada item da IDEO do dia com flag + descrição (preenchido se REALIZADA_COM_ALTERACAO). */
  equipamentos: IdeoEquipamentoFormItem[];
}

interface IdeoEquipamentoFormItem {
  item: string;
  alteracao: boolean;
  descricao: string;
}

function emptyForm(): Record<TipoIdeo, IdeoStatusForm> {
  return {
    ABTS: {
      marcado: false,
      estado: 'REALIZADA_SEM_ALTERACAO',
      motivoNaoRealizacao: '',
      equipamentos: [],
    },
    RESGATE: {
      marcado: false,
      estado: 'REALIZADA_SEM_ALTERACAO',
      motivoNaoRealizacao: '',
      equipamentos: [],
    },
  };
}

function buildFormFromStatuses(
  statuses: IdeoStatusDoDia[],
  previa: MapaForcaDoDia | null,
): Record<TipoIdeo, IdeoStatusForm> {
  const out = emptyForm();
  for (const tipo of TIPO_IDEO) {
    const itens = previa?.ideo.find((i) => i.tipo === tipo)?.itens ?? [];
    out[tipo].equipamentos = itens.map((it) => ({ item: it, alteracao: false, descricao: '' }));
  }
  for (const s of statuses) {
    const itens = previa?.ideo.find((i) => i.tipo === s.tipo)?.itens ?? [];
    const equipamentos: IdeoEquipamentoFormItem[] = itens.map((it) => {
      const match = (s.equipamentos ?? []).find(
        (eq: IdeoEquipamentoAlteracao) => eq.item === it,
      );
      return {
        item: it,
        alteracao: Boolean(match),
        descricao: match?.descricao ?? '',
      };
    });
    out[s.tipo] = {
      marcado: true,
      estado: s.estado,
      motivoNaoRealizacao: s.motivoNaoRealizacao ?? '',
      equipamentos,
    };
  }
  return out;
}

function corCardEstado(estado: EstadoIdeo, marcado: boolean): string {
  if (!marcado) return 'border-slate-300 bg-white';
  switch (estado) {
    case 'REALIZADA_SEM_ALTERACAO':
      return 'border-emerald-500 bg-emerald-50';
    case 'REALIZADA_COM_ALTERACAO':
      return 'border-cyan-500 bg-cyan-50';
    case 'NAO_REALIZADA':
      return 'border-amber-500 bg-amber-50';
    default:
      return 'border-slate-300 bg-white';
  }
}

import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  TIPO_IDEO,
  gerarTextoFiscalAtestadoIdeo,
  type IdeoStatusDoDia,
  type MapaForcaDoDia,
  type TipoIdeo,
} from '@argus/shared-types';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

/**
 * S6i — Tela do Fiscal para atestar IDEO de cada tipo (ABTS/RESGATE) no dia.
 *
 * 2 cards (1 por tipo): toggle "realizada" + textarea de motivo (obrigatório
 * quando não realizada). Preview em tempo real do texto institucional do
 * Fiscal que será impresso na PD (S10/S11).
 */
export function ServicoIdeoPage() {
  const { data } = useParams<{ data: string }>();
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
        setStatusByTipo(buildFormFromStatuses(statuses));
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
        realizada: statusByTipo[t].realizada,
        motivoNaoRealizacao: statusByTipo[t].realizada
          ? undefined
          : statusByTipo[t].motivoNaoRealizacao,
        fiscalNf: fiscalParaTexto?.nf ?? '',
        geradoEm: new Date().toISOString(),
      }),
    );
    return gerarTextoFiscalAtestadoIdeo(statuses, fiscalParaTexto);
  }, [data, statusByTipo, fiscalParaTexto]);

  if (!data) return <p>Data inválida.</p>;
  if (!user) return null;

  const podeAtestar =
    user.papeis.includes('admin') ||
    user.papeis.includes('fiscal') ||
    user.papeis.includes('sargenteante');

  const handleSalvar = async (tipo: TipoIdeo) => {
    if (!data) return;
    const f = statusByTipo[tipo];
    if (!f.realizada && !f.motivoNaoRealizacao.trim()) {
      setError(`Motivo é obrigatório quando IDEO ${tipo} não foi realizada.`);
      return;
    }
    setSaving(tipo);
    setError(null);
    setSavedMsg(null);
    try {
      const r = await api.ideoStatusUpsert(data, {
        tipo,
        realizada: f.realizada,
        motivoNaoRealizacao: f.realizada ? undefined : f.motivoNaoRealizacao.trim(),
      });
      setStatusByTipo((prev) => ({
        ...prev,
        [tipo]: { ...prev[tipo], marcado: true },
      }));
      setSavedMsg(`IDEO ${tipo} atestada por NF ${r.fiscalNf}.`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : `Erro ao salvar IDEO ${tipo}`);
    } finally {
      setSaving(null);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-cbmes-red px-4 py-4 text-white">
        <Link to={`/mapa-forca/${data}`} className="text-sm opacity-90 hover:opacity-100">
          ← Voltar à Prévia
        </Link>
        <h1 className="mt-1 text-lg font-bold">Inspeção Diária de Equipamentos (IDEO)</h1>
        <p className="text-xs opacity-90">{data} · Atestado pelo Fiscal de Serviço</p>
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

        {!podeAtestar && (
          <div className="mt-2 rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
            Apenas <strong>Fiscal de Serviço</strong>, Sargenteante ou Admin podem atestar IDEO.
          </div>
        )}

        <div className="mt-3 space-y-3">
          {TIPO_IDEO.map((tipo) => {
            const f = statusByTipo[tipo];
            const itensCadastrados = previa?.ideo.find((i) => i.tipo === tipo)?.itens ?? [];
            return (
              <div
                key={tipo}
                className={`rounded border-2 p-3 ${
                  f.marcado
                    ? f.realizada
                      ? 'border-emerald-500 bg-emerald-50'
                      : 'border-amber-500 bg-amber-50'
                    : 'border-slate-300 bg-white'
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-base font-bold text-cbmes-blue">IDEO {tipo}</h3>
                  {f.marcado && (
                    <span
                      className={`rounded-full px-3 py-0.5 text-xs font-bold uppercase ${
                        f.realizada ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white'
                      }`}
                    >
                      {f.realizada ? 'Realizada' : 'Não realizada'}
                    </span>
                  )}
                </div>
                {itensCadastrados.length > 0 && (
                  <p className="mt-1 text-[11px] text-slate-600">
                    Itens: {itensCadastrados.join(' · ')}
                  </p>
                )}
                <div className="mt-3 space-y-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={f.realizada}
                      onChange={(e) =>
                        setStatusByTipo((prev) => ({
                          ...prev,
                          [tipo]: { ...prev[tipo], realizada: e.target.checked },
                        }))
                      }
                      className="h-5 w-5"
                    />
                    <span className="text-sm">Inspeção realizada</span>
                  </label>
                  {!f.realizada && (
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
                      className="w-full rounded border border-slate-300 px-2 py-2 text-sm"
                    />
                  )}
                  {podeAtestar && (
                    <button
                      type="button"
                      onClick={() => handleSalvar(tipo)}
                      disabled={saving === tipo}
                      className="rounded-button bg-cbmes-red px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                    >
                      {saving === tipo ? 'Salvando…' : `Atestar IDEO ${tipo}`}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {previewTexto && (
          <section className="mt-5 rounded border border-cbmes-blue/30 bg-cbmes-blue/5 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-cbmes-blue">
              Preview do texto institucional (PD)
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
  realizada: boolean;
  motivoNaoRealizacao: string;
}

function emptyForm(): Record<TipoIdeo, IdeoStatusForm> {
  return {
    ABTS: { marcado: false, realizada: true, motivoNaoRealizacao: '' },
    RESGATE: { marcado: false, realizada: true, motivoNaoRealizacao: '' },
  };
}

function buildFormFromStatuses(statuses: IdeoStatusDoDia[]): Record<TipoIdeo, IdeoStatusForm> {
  const out = emptyForm();
  for (const s of statuses) {
    out[s.tipo] = {
      marcado: true,
      realizada: s.realizada,
      motivoNaoRealizacao: s.motivoNaoRealizacao ?? '',
    };
  }
  return out;
}

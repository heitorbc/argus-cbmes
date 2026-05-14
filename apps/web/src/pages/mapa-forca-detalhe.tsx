import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ESTADO_SERVICO_LABEL,
  TIPO_DISPENSA,
  TIPO_DISPENSA_LABEL,
  type AjustesPrevia,
  type AlteracaoDiversa,
  type EscalaEspecialAtoLight,
  type LetraEquipe,
  type ParRecurso,
  type PeriodoTroca,
  type PeriodoTrocaPredefinido,
  type PreviaAtestado,
  type PreviaDispensa,
  type MapaForcaDoDia,
  type PreviaNotaServico,
  type Viatura,
  type TipoDispensa,
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
  TROCAS_AUTORIZADAS_INDISPONIVEIS: 'Trocas autorizadas indisponíveis',
};

function formatDataBr(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/**
 * S0.x/rename-mapa-forca — Tela de detalhe do Mapa Força para uma data.
 *
 * - Sempre carrega em modo read-only por padrão.
 * - Botão "Iniciar Prévia do Mapa Força" libera edição APENAS para o
 *   Fiscal escalado do dia (computado pelo backend) ou admin.
 * - Edição efetiva (swaps, ajustes, ativações) só fica habilitada quando
 *   estadoServico === 'PREVIA_INICIADA' E o usuário é o iniciador (ou admin).
 */
export function MapaForcaDetalhePage() {
  const { data: dataParam } = useParams<{ data: string }>();
  const { user } = useAuth();
  const isAdmin = user?.papeis.includes('admin') ?? false;

  const data = dataParam ?? '';
  const [previa, setPrevia] = useState<MapaForcaDoDia | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [servicoActionInflight, setServicoActionInflight] = useState(false);

  // Edição liberada SOMENTE quando o serviço está em PREVIA_INICIADA e o
  // usuário é o iniciador da Prévia (ou admin). Para os demais casos
  // (NAO_INICIADO, PREVIA_INICIADA por outro NF, INICIADO+) é read-only.
  const estado = previa?.estadoServico ?? 'NAO_INICIADO';
  const isPreviaInitiator = previa?.previaIniciadaPorNf === user?.nf;
  const isReadOnly = !(estado === 'PREVIA_INICIADA' && (isAdmin || isPreviaInitiator));

  // Pode iniciar Prévia se: estado é NAO_INICIADO E (user.nf == fiscal escalado OR admin)
  const fiscalNf = previa?.fiscal?.militarNf ?? null;
  const podeIniciarPrevia =
    estado === 'NAO_INICIADO' && (isAdmin || (fiscalNf !== null && fiscalNf === user?.nf));

  // Pode iniciar Serviço se: estado é PREVIA_INICIADA E (admin OR initiator)
  const podeIniciarServico =
    estado === 'PREVIA_INICIADA' && (isAdmin || isPreviaInitiator);

  // Pode cancelar Prévia: mesmo critério do iniciar serviço
  const podeCancelarPrevia = podeIniciarServico;

  // S0.5 — Tap-to-swap (UX): primeiro tap registra a posição; segundo tap
  // em outra posição da mesma equipe dispara o swap via PUT /previa/ajustes.
  // Cancela com clique no mesmo botão.
  const [swapOrigem, setSwapOrigem] = useState<{
    equipe: LetraEquipe;
    viatura: string;
    funcao: string;
  } | null>(null);
  const [swapInflight, setSwapInflight] = useState(false);

  // Swap segue o mesmo gate: edição liberada apenas em PREVIA_INICIADA pelo iniciador (ou admin).
  const podeSwap = !isReadOnly;

  const handleSwapClick = async (
    equipe: LetraEquipe,
    viatura: string,
    funcao: string,
  ): Promise<void> => {
    if (!previa || !podeSwap) return;
    if (!swapOrigem) {
      setSwapOrigem({ equipe, viatura, funcao });
      return;
    }
    if (
      swapOrigem.equipe === equipe &&
      swapOrigem.viatura === viatura &&
      swapOrigem.funcao === funcao
    ) {
      setSwapOrigem(null);
      return;
    }
    if (swapOrigem.equipe !== equipe) {
      setError('Swap só é permitido entre posições da MESMA equipe.');
      setSwapOrigem(null);
      return;
    }
    setSwapInflight(true);
    setError(null);
    try {
      const ajustes = extractAjustes(previa);
      const novosSwaps = [
        ...ajustes.swapsMilitares,
        {
          equipe,
          viaturaA: swapOrigem.viatura,
          funcaoA: swapOrigem.funcao,
          viaturaB: viatura,
          funcaoB: funcao,
        },
      ];
      await fetch(`${import.meta.env.VITE_API_URL ?? 'http://localhost:3000'}/mapa-forca/${data}/ajustes`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...ajustes, swapsMilitares: novosSwaps }),
      }).then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      });
      setSwapOrigem(null);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao trocar militares');
    } finally {
      setSwapInflight(false);
    }
  };

  const handleSwapDesfazer = async (index: number): Promise<void> => {
    if (!previa) return;
    setSwapInflight(true);
    setError(null);
    try {
      const ajustes = extractAjustes(previa);
      const novosSwaps = ajustes.swapsMilitares.filter((_, i) => i !== index);
      await fetch(`${import.meta.env.VITE_API_URL ?? 'http://localhost:3000'}/mapa-forca/${data}/ajustes`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...ajustes, swapsMilitares: novosSwaps }),
      }).then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      });
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao desfazer swap');
    } finally {
      setSwapInflight(false);
    }
  };

  /**
   * S0.x/Fix-Mergulho — Toggle do override M01↔M02 do dia. Se ainda não
   * tem entry para a data atual, adiciona; se já tem, remove (idempotente).
   * Reload pega o novo estado calculado pelo backend.
   */
  const handleToggleOverrideMergulho = async (): Promise<void> => {
    if (!previa) return;
    setSwapInflight(true);
    setError(null);
    try {
      const ajustes = extractAjustes(previa);
      const existe = ajustes.overridesMergulho.some((o) => o.data === data);
      const novos = existe
        ? ajustes.overridesMergulho.filter((o) => o.data !== data)
        : [...ajustes.overridesMergulho, { data, swap: true as const }];
      await fetch(`${import.meta.env.VITE_API_URL ?? 'http://localhost:3000'}/mapa-forca/${data}/ajustes`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...ajustes, overridesMergulho: novos }),
      }).then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      });
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao trocar M01↔M02');
    } finally {
      setSwapInflight(false);
    }
  };

  /**
   * Toggle do override 01↔02 para pares operacionais (ABTS/RESGATE/SALVAMAR/
   * QUADRICICLO). Idempotente: se já existe, remove; se não, adiciona.
   */
  const handleToggleOverridePar = async (par: ParRecurso): Promise<void> => {
    if (!previa) return;
    setSwapInflight(true);
    setError(null);
    try {
      const ajustes = extractAjustes(previa);
      const existe = ajustes.overridesParesRecursos.some(
        (o) => o.data === data && o.par === par,
      );
      const novos = existe
        ? ajustes.overridesParesRecursos.filter((o) => !(o.data === data && o.par === par))
        : [...ajustes.overridesParesRecursos, { data, par, swap: true as const }];
      await fetch(`${import.meta.env.VITE_API_URL ?? 'http://localhost:3000'}/mapa-forca/${data}/ajustes`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...ajustes, overridesParesRecursos: novos }),
      }).then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      });
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : `Erro ao trocar ${par} 01↔02`);
    } finally {
      setSwapInflight(false);
    }
  };

  const reload = () => {
    api
      .mapaForcaDoDia(data)
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

  // S0.x/rename-mapa-forca — Iniciar Prévia (libera edição para Fiscal/admin).
  const handleIniciarPrevia = async () => {
    setServicoActionInflight(true);
    setError(null);
    try {
      await api.servicoIniciarPrevia(data);
      reload();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erro ao iniciar Prévia');
    } finally {
      setServicoActionInflight(false);
    }
  };

  const handleCancelarPrevia = async () => {
    if (!confirm('Cancelar Prévia em edição? Os ajustes ficam preservados, mas a Prévia volta a ser somente leitura.')) return;
    setServicoActionInflight(true);
    setError(null);
    try {
      await api.servicoCancelarPrevia(data);
      reload();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erro ao cancelar Prévia');
    } finally {
      setServicoActionInflight(false);
    }
  };

  const handleEncerrarServico = async () => {
    if (
      !confirm(
        `Encerrar serviço de ${data} manualmente? O fluxo normal é a auto-finalização ` +
          `quando o próximo Fiscal iniciar o serviço (passagem de serviço).`,
      )
    )
      return;
    setServicoActionInflight(true);
    setError(null);
    try {
      await api.servicoEncerrar(data);
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
      .mapaForcaDoDia(data)
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
    if (!previa) return new Map<string, MapaForcaDoDia['tripulacao']>();
    const map = new Map<string, MapaForcaDoDia['tripulacao']>();
    for (const t of previa.tripulacao) {
      const key = t.viatura || '(sem viatura)';
      const arr = map.get(key) ?? [];
      arr.push(t);
      map.set(key, arr);
    }
    return map;
  }, [previa]);

  /**
   * Mapa "recurso → composição atual do MF" para render lado-a-lado nos cards
   * da tripulação. Chave casa com `viatura` da tripulação XLSX (ABTS_01,
   * RESGATE 01, etc.) — o parser do MF normaliza os nomes para a mesma forma.
   */
  const mfAtualPorRecurso = useMemo(() => {
    const m = new Map<string, MapaForcaDoDia['composicaoAtualMf'][number]>();
    if (!previa) return m;
    for (const r of previa.composicaoAtualMf) m.set(r.recurso, r);
    return m;
  }, [previa]);

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-cbmes-red px-4 py-4 text-white">
        <Link to="/mapa-forca" className="text-sm opacity-90 hover:opacity-100">
          ← Voltar para o calendário
        </Link>
        <h1 className="mt-1 text-lg font-bold">Mapa Força — {formatDataBr(data)}</h1>
        <p className="text-xs opacity-90">
          Composição do dia · {ESTADO_SERVICO_LABEL[estado]}
        </p>
      </header>

      <section className="mx-auto max-w-3xl p-4">
        <div className="flex items-center justify-between rounded border border-slate-200 bg-white p-3">
          <div className="text-sm text-slate-700">
            <span className="font-medium">Data:</span> {formatDataBr(data)}
            {previa && previa.equipe && (
              <span className="ml-2 text-xs uppercase text-slate-500">
                · Equipe {previa.equipe} ({previa.equipeNome})
              </span>
            )}
          </div>
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

        {/* S0.x/rename-mapa-forca — Banner do estado + ações da Prévia */}
        {previa && (
          <PreviaEstadoBanner
            previa={previa}
            podeIniciarPrevia={podeIniciarPrevia}
            podeCancelarPrevia={podeCancelarPrevia}
            inflight={servicoActionInflight}
            onIniciarPrevia={handleIniciarPrevia}
            onCancelarPrevia={handleCancelarPrevia}
          />
        )}

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
                <div className="mb-2 flex items-baseline justify-between">
                  <h3 className="text-sm font-semibold text-slate-700">Tripulação</h3>
                  {swapOrigem && (
                    <button
                      type="button"
                      onClick={() => setSwapOrigem(null)}
                      className="text-[10px] uppercase tracking-wide text-cbmes-blue hover:underline"
                    >
                      Cancelar swap
                    </button>
                  )}
                </div>
                {swapOrigem && (
                  <p className="mb-2 rounded border border-cbmes-blue/30 bg-cbmes-blue/5 p-2 text-[11px] text-cbmes-blue">
                    🔄 Swap em curso (origem:{' '}
                    <strong>
                      {swapOrigem.viatura} / {swapOrigem.funcao} ({swapOrigem.equipe})
                    </strong>
                    ). Toque em outra posição da MESMA equipe para trocar.
                  </p>
                )}
                {previa.swapsMilitares.length > 0 && (
                  <details className="mb-2 rounded border border-slate-200 bg-white p-2 text-xs">
                    <summary className="cursor-pointer font-medium text-slate-700">
                      Realocações internas da equipe ({previa.swapsMilitares.length})
                    </summary>
                    <p className="mt-1 text-[10px] italic text-slate-500">
                      Movimentações da prévia do dia. Não constituem trocas de serviço — não
                      são registradas em Parte Diária nem como ajuste pré-escala.
                    </p>
                    <ul className="mt-2 space-y-1">
                      {previa.swapsMilitares.map((s, i) => (
                        <li key={i} className="flex items-center justify-between gap-2">
                          <span className="text-slate-600">
                            {s.equipe}: {s.viaturaA}/{s.funcaoA} ↔ {s.viaturaB}/{s.funcaoB}
                          </span>
                          {podeSwap && (
                            <button
                              type="button"
                              onClick={() => void handleSwapDesfazer(i)}
                              disabled={swapInflight}
                              className="rounded border border-slate-300 px-2 py-0.5 text-[10px] text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                            >
                              desfazer
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                <div className="space-y-3">
                  {[...tripulacaoPorViatura.entries()].map(([viatura, linhas]) => {
                    const isMergulho = viatura === 'MERGULHO 01' || viatura === 'MERGULHO 02';
                    const showSwapMergulho =
                      isMergulho &&
                      podeSwap &&
                      tripulacaoPorViatura.has('MERGULHO 01') &&
                      tripulacaoPorViatura.has('MERGULHO 02');
                    const swapAtivo = previa.overridesMergulho.some((o) => o.data === data);
                    // Pares 01/02 (não-Mergulho): RESGATE/ABTS/SALVAMAR/QUADRICICLO.
                    // Botão "⇄ Trocar 01↔02" aparece quando há viatura escalada (XLSX)
                    // de qualquer um dos lados do par e o Fiscal tem permissão.
                    const parInfo = detectarParRecurso(viatura);
                    const overridePar = parInfo
                      ? previa.overridesParesRecursos.find(
                          (o) => o.data === data && o.par === parInfo.par,
                        )
                      : null;
                    const showSwapPar = !!parInfo && podeSwap;
                    return (
                    <article key={viatura} className="rounded border border-slate-200 bg-white p-3">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-sm font-bold text-cbmes-blue">
                          {viatura}
                          {swapAtivo && isMergulho && (
                            <span className="ml-2 rounded-full bg-cbmes-blue/10 px-2 py-0.5 text-[10px] font-medium text-cbmes-blue">
                              ⇄ M01↔M02 trocados
                            </span>
                          )}
                          {overridePar && parInfo && (
                            <span className="ml-2 rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-medium text-amber-900">
                              ⇄ {parInfo.par} 01↔02 trocados
                            </span>
                          )}
                        </p>
                        {showSwapMergulho && (
                          <button
                            type="button"
                            onClick={() => void handleToggleOverrideMergulho()}
                            disabled={swapInflight}
                            title="Trocar quem está em MERGULHO 01 com MERGULHO 02 neste dia"
                            className="rounded border border-cbmes-blue px-2 py-0.5 text-[10px] font-medium text-cbmes-blue hover:bg-cbmes-blue/10 disabled:opacity-50"
                          >
                            {swapAtivo ? '↶ desfazer' : '⇄ Trocar M01↔M02'}
                          </button>
                        )}
                        {showSwapPar && parInfo && (
                          <button
                            type="button"
                            onClick={() => void handleToggleOverridePar(parInfo.par)}
                            disabled={swapInflight}
                            title={`Trocar tripulação entre ${parInfo.v01} e ${parInfo.v02} neste dia`}
                            className="rounded border border-cbmes-blue px-2 py-0.5 text-[10px] font-medium text-cbmes-blue hover:bg-cbmes-blue/10 disabled:opacity-50"
                          >
                            {overridePar ? '↶ desfazer' : `⇄ Trocar ${parInfo.par} 01↔02`}
                          </button>
                        )}
                      </div>
                      <div className="mt-1 grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div>
                          <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-cbmes-blue">
                            Próximo turno (XLSX)
                          </p>
                          <ul className="divide-y divide-slate-100 text-sm">
                            {linhas.map((t, i) => {
                              const isOrigemSelecionada =
                                swapOrigem?.equipe === t.equipe &&
                                swapOrigem?.viatura === t.viatura &&
                                swapOrigem?.funcao === t.funcao;
                              const swapDisabled =
                                !!swapOrigem && swapOrigem.equipe !== t.equipe;
                              return (
                                <li
                                  key={i}
                                  className={`flex items-baseline justify-between gap-2 py-1 ${
                                    t.isFiscal ? 'rounded bg-cbmes-red/5 px-2' : ''
                                  } ${isOrigemSelecionada ? 'rounded bg-cbmes-blue/10 px-2' : ''}`}
                                >
                                  <span className="text-xs uppercase text-slate-500">
                                    {t.funcao || '—'}
                                    {t.isFiscal && (
                                      <span className="ml-2 rounded-full bg-cbmes-red px-2 py-0.5 text-[10px] font-bold text-white">
                                        FISCAL
                                      </span>
                                    )}
                                  </span>
                                  <span className="flex items-baseline gap-2 text-right">
                                    <span>
                                      {t.militarResolvido ? (
                                        <>
                                          <span className="font-medium">
                                            {t.militarResolvido.posto}{' '}
                                            {t.militarResolvido.nomeGuerra ??
                                              t.militarResolvido.nome.split(' ')[0]}
                                          </span>
                                          <span className="ml-2 text-xs text-slate-500">
                                            NF {t.militarResolvido.nf} · ANT{' '}
                                            {t.militarResolvido.ant}
                                          </span>
                                        </>
                                      ) : (
                                        <span className="text-feedback-warn">
                                          {t.militarRef.raw}{' '}
                                          <span className="text-xs">(sem NF)</span>
                                        </span>
                                      )}
                                    </span>
                                    {podeSwap && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          void handleSwapClick(t.equipe, t.viatura, t.funcao)
                                        }
                                        disabled={swapInflight || swapDisabled}
                                        title={
                                          swapDisabled
                                            ? 'Swap apenas dentro da mesma equipe'
                                            : isOrigemSelecionada
                                              ? 'Cancelar swap'
                                              : 'Trocar com outra posição'
                                        }
                                        className="rounded border border-slate-300 px-2 py-0.5 text-[10px] text-slate-600 hover:bg-slate-50 disabled:opacity-30"
                                      >
                                        {isOrigemSelecionada ? '×' : '🔄'}
                                      </button>
                                    )}
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                        <ComposicaoAtualMfPanel
                          atual={mfAtualPorRecurso.get(viatura) ?? null}
                        />
                      </div>
                    </article>
                    );
                  })}
                </div>
              </section>
            )}

            <EscalaEspecialBox
              data={data}
              atos={previa.escalaEspecialAtos}
              trocas={previa.trocasEscalaEspecial}
              isReadOnly={isReadOnly}
              onSaved={reload}
            />

            {previa.ferias.length > 0 && (
              <section className="mt-4">
                <h3 className="mb-2 text-sm font-semibold text-slate-700">
                  Militares de férias ({previa.ferias.length})
                </h3>
                <ul className="space-y-2">
                  {previa.ferias.map((f) => (
                    <li
                      key={f.feriasId}
                      className="rounded border border-amber-200 bg-amber-50 p-3 text-sm"
                    >
                      <p className="font-medium text-amber-900">
                        🏝️ {f.militarRaw}
                      </p>
                      <p className="mt-0.5 text-xs text-amber-800">
                        Início {formatDataBr(f.dataInicio)} · {f.dias} dias · mês previsto{' '}
                        {f.mesAno}
                      </p>
                      {f.observacoes && (
                        <p className="mt-1 text-xs text-amber-700">{f.observacoes}</p>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <AtivarRecursoCard
              data={data}
              previa={previa}
              isReadOnly={isReadOnly}
              onSaved={reload}
            />

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
              atestadosAtivos={previa.atestados}
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

function extractAjustes(previa: MapaForcaDoDia): AjustesPrevia {
  return {
    trocas: previa.trocas,
    escalaEspecial: previa.escalaEspecial,
    notasServico: previa.notasServico,
    dispensas: previa.dispensas,
    trocasEscalaEspecial: previa.trocasEscalaEspecial,
    swapsMilitares: previa.swapsMilitares,
    overridesMergulho: previa.overridesMergulho,
    overridesParesRecursos: previa.overridesParesRecursos,
    ativacoesRecurso: previa.ativacoesRecurso,
  };
}

/**
 * Painel "Atual (MF)" exibido ao lado da tripulação do XLSX em cada card de
 * recurso. Mostra chefe / motorista / operadores conforme o turno corrente
 * (col E-J do Mapa Força). Quando o MF não tem nada para o recurso,
 * mantém uma coluna placeholder para preservar o paralelo visual.
 */
function ComposicaoAtualMfPanel({
  atual,
}: {
  atual: { recurso: string; chefe?: string; motorista?: string; operadores: string[] } | null;
}) {
  return (
    <div className="rounded border border-slate-200 bg-slate-50 p-2">
      <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-600">
        Atual (MF)
      </p>
      {!atual || (!atual.chefe && !atual.motorista && atual.operadores.length === 0) ? (
        <p className="text-xs italic text-slate-400">Sem registro no MF</p>
      ) : (
        <ul className="space-y-0.5 text-xs">
          {atual.chefe && (
            <li>
              <span className="uppercase text-slate-500">Ch:</span>{' '}
              <span className="font-medium">{atual.chefe}</span>
            </li>
          )}
          {atual.motorista && (
            <li>
              <span className="uppercase text-slate-500">Mot:</span>{' '}
              <span className="font-medium">{atual.motorista}</span>
            </li>
          )}
          {atual.operadores.map((o, i) => (
            <li key={i}>
              <span className="uppercase text-slate-500">Op {i + 1}:</span>{' '}
              <span className="font-medium">{o}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Reconhece se a viatura faz parte de um par operacional 01/02 reroteável
 * pelo Fiscal (ABTS/RESGATE/SALVAMAR/QUADRICICLO). Mergulho tem botão próprio.
 */
function detectarParRecurso(
  viatura: string,
): { par: ParRecurso; v01: string; v02: string } | null {
  const tabela: Array<{ par: ParRecurso; v01: string; v02: string }> = [
    { par: 'ABTS', v01: 'ABTS_01', v02: 'ABTS_02' },
    { par: 'RESGATE', v01: 'RESGATE 01', v02: 'RESGATE 02' },
    { par: 'SALVAMAR', v01: 'SALVAMAR 01', v02: 'SALVAMAR 02' },
    { par: 'QUADRICICLO', v01: 'QUADRICICLO 01', v02: 'QUADRICICLO 02' },
  ];
  return tabela.find((p) => p.v01 === viatura || p.v02 === viatura) ?? null;
}

function atoKey(a: EscalaEspecialAtoLight): string {
  return `${a.data}|${a.militarRaw}|${a.horario}|${a.funcao}`;
}

/**
 * Box "Escala Especial" — antes vivia dentro de `AjustesPreTurno`. Promovido
 * para seção própria (sempre visível, entre Tripulação e Férias) porque é
 * informação operacional de leitura primária para o Fiscal. Os botões de
 * troca acompanham os atos: o modal de registro segue o mesmo (`ModalTrocaEscalaEspecial`).
 */
function EscalaEspecialBox({
  data,
  atos,
  trocas,
  isReadOnly,
  onSaved,
}: {
  data: string;
  atos: EscalaEspecialAtoLight[];
  trocas: TrocaEscalaEspecial[];
  isReadOnly: boolean;
  onSaved: () => void;
}) {
  const [modalAto, setModalAto] = useState<EscalaEspecialAtoLight | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const trocasPorAto = new Map<string, TrocaEscalaEspecial>();
  for (const t of trocas) trocasPorAto.set(atoKey(t.atoOriginal), t);

  const removerTrocaEspecial = async (ato: EscalaEspecialAtoLight) => {
    try {
      await api.mapaForcaRemoveTrocaEscalaEspecial(data, atoKey(ato));
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erro ao remover troca');
    }
  };

  return (
    <>
      <section className="mt-4">
        <h3 className="mb-2 text-sm font-semibold text-slate-700">
          Escala Especial{atos.length > 0 && ` (${atos.length} ato${atos.length === 1 ? '' : 's'})`}
        </h3>
        {err && (
          <p
            role="alert"
            className="mb-2 rounded border border-feedback-error/30 bg-feedback-error/10 p-2 text-xs text-feedback-error"
          >
            {err}
          </p>
        )}
        {atos.length === 0 ? (
          <p className="rounded border border-dashed border-slate-300 bg-white p-3 text-xs text-slate-500">
            Nenhum ato de Escala Especial importado para este dia. Importe o XLSM em{' '}
            <Link to="/cadastros/escalas-especiais" className="text-cbmes-blue underline">
              /cadastros/escalas-especiais
            </Link>
            .
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded border border-slate-200 bg-white">
            {atos.map((a) => {
              const key = atoKey(a);
              const troca = trocasPorAto.get(key);
              return (
                <li key={key} className="p-3 text-sm">
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
                      <span className="ml-2 text-xs text-slate-500">
                        {a.horario} · {a.funcao}
                      </span>
                    </span>
                    {!isReadOnly &&
                      (troca ? (
                        <button
                          type="button"
                          onClick={() => void removerTrocaEspecial(a)}
                          className="rounded border border-feedback-error px-2 py-1 text-xs text-feedback-error"
                        >
                          Desfazer troca
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setModalAto(a)}
                          className="rounded border border-cbmes-blue px-2 py-1 text-xs text-cbmes-blue"
                        >
                          Registrar Troca
                        </button>
                      ))}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

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

function AjustesPreTurno({
  data,
  initial,
  atestadosAtivos,
  isReadOnly,
  onSaved,
}: {
  data: string;
  isReadOnly: boolean;
  initial: AjustesPrevia;
  atestadosAtivos: MapaForcaDoDia['atestados'];
  onSaved: () => void;
}) {
  const [state, setState] = useState<AjustesPrevia>(initial);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // sincroniza quando a data muda
  useEffect(() => {
    setState(initial);
  }, [data, initial]);

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      await fetch(
        `${import.meta.env.VITE_API_URL ?? 'http://localhost:3000'}/mapa-forca/${data}/ajustes`,
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
    <>
      {/*
       * S0.x/Fix-2 — A section "Chefe de Operações (escalados no dia)"
       * foi removida porque o Chefe Titular agora aparece no card
       * "CHEFE DE OPERAÇÕES" da Tripulação (injetado em
       * `previa.tripulacao` pelo PreviaService), junto com o motorista
       * vindo do XLSX.
       */}

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

          <NotasServicoFieldset dataIso={data} existentes={state.notasServico} onSaved={onSaved} />

          <DispensasFieldset dataIso={data} existentes={state.dispensas} onSaved={onSaved} />
          <AtestadosFieldset dataIso={data} existentes={atestadosAtivos} onSaved={onSaved} />
          {/* `state.dispensas` e `atestadosAtivos` vêm read-only do backend
              (DispensasService / AtestadosService). UI de criação está em
              DispensasFieldset (S6j) e AtestadosFieldset (S6k). */}

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
      await api.mapaForcaAddTrocaEscalaEspecial(data, {
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
  previa: MapaForcaDoDia;
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
          <Link
            to={`/servico/${previa.data}/ideo`}
            className="block rounded border border-cbmes-blue/30 bg-white p-3 hover:bg-cbmes-blue/5 md:col-span-2"
          >
            <h4 className="text-sm font-semibold text-cbmes-blue">✅ IDEO (atestar Fiscal)</h4>
            <p className="mt-1 text-xs text-slate-600">
              Marcar IDEO ABTS / RESGATE como realizada/não realizada e gerar texto institucional do
              Fiscal para a Parte Diária.
            </p>
            {previa.textoAtestadoIdeoFiscal && (
              <p className="mt-1 text-[10px] uppercase tracking-wide text-emerald-700">
                ✓ texto do Fiscal pronto
              </p>
            )}
          </Link>
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
  composicaoMf: MapaForcaDoDia['composicaoMf'];
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
  composicaoMf: MapaForcaDoDia['composicaoMf'];
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
  composicaoMf: MapaForcaDoDia['composicaoMf'];
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

/**
 * S6j — Fieldset de Dispensas dentro do Ajustes Pré-turno.
 *
 * Lista as dispensas ativas no dia (vindas de `previa.dispensas`, que o
 * backend deriva de `DispensasService.listAtivasNoDia`). Permite criar nova
 * dispensa via `api.dispensasCreate()` direto (não passa pelo upsert dos
 * ajustes — a entidade é canônica e gerenciada em /cadastros/dispensas).
 */
function DispensasFieldset({
  dataIso,
  existentes,
  onSaved,
}: {
  dataIso: string;
  existentes: PreviaDispensa[];
  onSaved: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [militarNf, setMilitarNf] = useState<string | undefined>(undefined);
  const [militarRaw, setMilitarRaw] = useState<string>('');
  const [tipo, setTipo] = useState<TipoDispensa>('I_TAF');
  const [dataInicio, setDataInicio] = useState<string>(dataIso);
  const [dias, setDias] = useState<number>(1);
  const [edocs, setEdocs] = useState<string>('');
  const [obs, setObs] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const cancelar = () => {
    setShowForm(false);
    setMilitarNf(undefined);
    setMilitarRaw('');
    setTipo('I_TAF');
    setDataInicio(dataIso);
    setDias(1);
    setEdocs('');
    setObs('');
    setErr(null);
  };

  const salvar = async () => {
    if (!militarNf) {
      setErr('Selecione o militar.');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await api.dispensasCreate({
        militarNf,
        tipo,
        dataInicio,
        dias,
        numeroEdocs: edocs.trim() || undefined,
        observacoes: obs.trim() || undefined,
      });
      cancelar();
      onSaved();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Erro ao salvar dispensa');
    } finally {
      setSaving(false);
    }
  };

  const remover = async (d: PreviaDispensa) => {
    if (!d.dispensaId) return;
    if (!confirm(`Remover dispensa de ${d.militarRaw}?`)) return;
    try {
      await api.dispensasRemove(d.dispensaId);
      onSaved();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Erro ao remover dispensa');
    }
  };

  return (
    <fieldset className="rounded border border-slate-200 p-2">
      <legend className="px-1 font-medium text-slate-700">Dispensas ativas no dia</legend>
      {err && (
        <p className="mt-1 rounded border border-feedback-error/30 bg-feedback-error/10 p-2 text-xs text-feedback-error">
          {err}
        </p>
      )}
      {existentes.length === 0 && !showForm && (
        <p className="mt-1 text-xs text-slate-500">Nenhuma dispensa ativa hoje.</p>
      )}
      {existentes.map((d) => (
        <div
          key={d.dispensaId ?? `${d.militarNf}-${d.dataInicio}`}
          className="mt-2 flex items-start justify-between gap-2 rounded border border-slate-200 bg-slate-50 p-2 text-xs"
        >
          <div>
            <p className="font-medium text-cbmes-blue">{d.militarRaw}</p>
            <p className="text-slate-700">
              {d.tipo
                ? `${d.tipo} — ${d.tipoLabel ?? TIPO_DISPENSA_LABEL[d.tipo]}`
                : 'Tipo não informado'}
            </p>
            <p className="text-slate-500">
              {d.dataInicio ?? '?'} · {d.dias ?? '?'} dia(s)
              {d.numeroEdocs && <> · E-Docs {d.numeroEdocs}</>}
            </p>
          </div>
          {d.dispensaId && (
            <button
              type="button"
              onClick={() => void remover(d)}
              className="rounded border border-feedback-error px-2 py-1 text-feedback-error"
            >
              Remover
            </button>
          )}
        </div>
      ))}

      {showForm ? (
        <div className="mt-3 space-y-2 rounded border border-cbmes-blue/30 bg-white p-3">
          <div>
            <p className="text-[10px] uppercase text-slate-500">Militar</p>
            <MilitarSelect
              value={militarNf}
              valueRaw={militarRaw}
              onChange={(nf, m) => {
                setMilitarNf(nf ?? undefined);
                setMilitarRaw(m ? `${m.posto} ${m.nomeGuerra ?? m.nome.split(' ')[0]}` : '');
              }}
              placeholder="Buscar militar (NF ou nome)"
            />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[2fr_1fr_1fr]">
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoDispensa)}
              className="rounded border border-slate-300 px-2 py-2 text-sm"
            >
              {TIPO_DISPENSA.map((t) => (
                <option key={t} value={t}>
                  {TIPO_DISPENSA_LABEL[t]}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              className="rounded border border-slate-300 px-2 py-2 text-sm"
            />
            <input
              type="number"
              min={1}
              max={365}
              value={dias}
              onChange={(e) => setDias(Number(e.target.value))}
              placeholder="Dias"
              className="rounded border border-slate-300 px-2 py-2 text-sm"
            />
          </div>
          <input
            type="text"
            value={edocs}
            onChange={(e) => setEdocs(e.target.value)}
            placeholder="Nº E-Docs (opcional)"
            className="w-full rounded border border-slate-300 px-2 py-2 text-sm"
          />
          <textarea
            rows={2}
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            placeholder="Observações (opcional)"
            className="w-full rounded border border-slate-300 px-2 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void salvar()}
              disabled={saving}
              className="flex-1 rounded-button bg-cbmes-red py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving ? 'Salvando…' : 'Cadastrar dispensa'}
            </button>
            <button
              type="button"
              onClick={cancelar}
              className="flex-1 rounded-button border border-slate-300 bg-white py-2 text-sm text-slate-700"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="mt-2 rounded border border-cbmes-blue px-3 py-1 text-cbmes-blue"
        >
          + Cadastrar dispensa
        </button>
      )}
    </fieldset>
  );
}

/**
 * S6k — Fieldset de Atestados Médicos dentro do Ajustes Pré-turno.
 *
 * Lista atestados ativos no dia (vindos de `previa.atestados`, derivado de
 * `AtestadosService.listAtivosNoDia`). Permite criar novo via
 * `api.atestadosCreate()` direto.
 */
function AtestadosFieldset({
  dataIso,
  existentes,
  onSaved,
}: {
  dataIso: string;
  existentes: PreviaAtestado[];
  onSaved: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [militarNf, setMilitarNf] = useState<string | undefined>(undefined);
  const [militarRaw, setMilitarRaw] = useState<string>('');
  const [dataInicio, setDataInicio] = useState<string>(dataIso);
  const [dias, setDias] = useState<number>(1);
  const [cid10, setCid10] = useState<string>('');
  const [crmMedico, setCrmMedico] = useState<string>('');
  const [obs, setObs] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const cancelar = () => {
    setShowForm(false);
    setMilitarNf(undefined);
    setMilitarRaw('');
    setDataInicio(dataIso);
    setDias(1);
    setCid10('');
    setCrmMedico('');
    setObs('');
    setErr(null);
  };

  const salvar = async () => {
    if (!militarNf) {
      setErr('Selecione o militar.');
      return;
    }
    if (!cid10.trim() || !crmMedico.trim()) {
      setErr('CID-10 e CRM são obrigatórios.');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await api.atestadosCreate({
        militarNf,
        dataInicio,
        dias,
        cid10: cid10.trim(),
        crmMedico: crmMedico.trim(),
        observacoes: obs.trim() || undefined,
      });
      cancelar();
      onSaved();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Erro ao salvar atestado');
    } finally {
      setSaving(false);
    }
  };

  const remover = async (a: PreviaAtestado) => {
    if (!confirm(`Remover atestado de ${a.militarRaw} (${a.cid10})?`)) return;
    try {
      await api.atestadosRemove(a.atestadoId);
      onSaved();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Erro ao remover atestado');
    }
  };

  return (
    <fieldset className="rounded border border-slate-200 p-2">
      <legend className="px-1 font-medium text-slate-700">Atestados ativos no dia</legend>
      {err && (
        <p className="mt-1 rounded border border-feedback-error/30 bg-feedback-error/10 p-2 text-xs text-feedback-error">
          {err}
        </p>
      )}
      {existentes.length === 0 && !showForm && (
        <p className="mt-1 text-xs text-slate-500">Nenhum atestado ativo hoje.</p>
      )}
      {existentes.map((a) => (
        <div
          key={a.atestadoId}
          className="mt-2 flex items-start justify-between gap-2 rounded border border-slate-200 bg-slate-50 p-2 text-xs"
        >
          <div>
            <p className="font-medium text-cbmes-blue">{a.militarRaw}</p>
            <p className="text-slate-700">
              <span className="mr-1 rounded-full bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-rose-700">
                {a.cid10}
              </span>
              CRM {a.crmMedico}
            </p>
            <p className="text-slate-500">
              {a.dataInicio} · {a.dias} dia(s)
            </p>
            {a.observacoes && <p className="italic text-slate-500">{a.observacoes}</p>}
          </div>
          <button
            type="button"
            onClick={() => void remover(a)}
            className="rounded border border-feedback-error px-2 py-1 text-feedback-error"
          >
            Remover
          </button>
        </div>
      ))}

      {showForm ? (
        <div className="mt-3 space-y-2 rounded border border-cbmes-blue/30 bg-white p-3">
          <div>
            <p className="text-[10px] uppercase text-slate-500">Militar</p>
            <MilitarSelect
              value={militarNf}
              valueRaw={militarRaw}
              onChange={(nf, m) => {
                setMilitarNf(nf ?? undefined);
                setMilitarRaw(m ? `${m.posto} ${m.nomeGuerra ?? m.nome.split(' ')[0]}` : '');
              }}
              placeholder="Buscar militar (NF ou nome)"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              className="rounded border border-slate-300 px-2 py-2 text-sm"
            />
            <input
              type="number"
              min={1}
              max={365}
              value={dias}
              onChange={(e) => setDias(Number(e.target.value))}
              placeholder="Dias"
              className="rounded border border-slate-300 px-2 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              value={cid10}
              onChange={(e) => setCid10(e.target.value)}
              placeholder="CID-10 (ex.: J11)"
              className="rounded border border-slate-300 px-2 py-2 text-sm"
            />
            <input
              type="text"
              value={crmMedico}
              onChange={(e) => setCrmMedico(e.target.value)}
              placeholder="CRM médico (ex.: CRM-ES 12345)"
              className="rounded border border-slate-300 px-2 py-2 text-sm"
            />
          </div>
          <textarea
            rows={2}
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            placeholder="Observações (opcional)"
            className="w-full rounded border border-slate-300 px-2 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void salvar()}
              disabled={saving}
              className="flex-1 rounded-button bg-cbmes-red py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving ? 'Salvando…' : 'Cadastrar atestado'}
            </button>
            <button
              type="button"
              onClick={cancelar}
              className="flex-1 rounded-button border border-slate-300 bg-white py-2 text-sm text-slate-700"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="mt-2 rounded border border-cbmes-blue px-3 py-1 text-cbmes-blue"
        >
          + Cadastrar atestado
        </button>
      )}
    </fieldset>
  );
}

/**
 * S6l — Fieldset de Notas de Serviço dentro do Ajustes Pré-turno.
 *
 * Lista NS do dia (vindas de previa.notasServico, derivadas de
 * NotasServicoService.listDoDia). Cadastra nova via api.notasServicoCreate.
 */
function NotasServicoFieldset({
  dataIso,
  existentes,
  onSaved,
}: {
  dataIso: string;
  existentes: PreviaNotaServico[];
  onSaved: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [horaInicio, setHoraInicio] = useState('08:00');
  const [horaFim, setHoraFim] = useState('18:00');
  const [viaturaPrefixo, setViaturaPrefixo] = useState('');
  const [militares, setMilitares] = useState<{ nf: string; raw: string }[]>([]);
  const [obs, setObs] = useState('');
  const [viaturas, setViaturas] = useState<Viatura[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!showForm) return;
    let cancelled = false;
    api
      .viaturasList()
      .then((vs) => {
        if (!cancelled) setViaturas(vs);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [showForm]);

  const cancelar = () => {
    setShowForm(false);
    setCodigo('');
    setDescricao('');
    setHoraInicio('08:00');
    setHoraFim('18:00');
    setViaturaPrefixo('');
    setMilitares([]);
    setObs('');
    setErr(null);
  };

  const salvar = async () => {
    if (!codigo.trim() || !descricao.trim()) {
      setErr('Código e descrição são obrigatórios.');
      return;
    }
    if (militares.length === 0) {
      setErr('Adicione pelo menos 1 militar.');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await api.notasServicoCreate({
        codigo: codigo.trim(),
        descricao: descricao.trim(),
        data: dataIso,
        horaInicio,
        horaFim,
        viaturaPrefixo: viaturaPrefixo.trim() || undefined,
        militaresNfs: militares.map((m) => m.nf),
        observacoes: obs.trim() || undefined,
      });
      cancelar();
      onSaved();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Erro ao salvar NS');
    } finally {
      setSaving(false);
    }
  };

  const remover = async (n: PreviaNotaServico) => {
    if (!n.notaServicoId) return;
    if (!confirm(`Remover ${n.codigo} - ${n.descricao}?`)) return;
    try {
      await api.notasServicoRemove(n.notaServicoId);
      onSaved();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Erro ao remover NS');
    }
  };

  const viaturasDisponiveis = viaturas.filter((v) => v.status !== 'BAIXADA');

  return (
    <fieldset className="rounded border border-slate-200 p-2">
      <legend className="px-1 font-medium text-slate-700">Notas de Serviço do dia</legend>
      {err && (
        <p className="mt-1 rounded border border-feedback-error/30 bg-feedback-error/10 p-2 text-xs text-feedback-error">
          {err}
        </p>
      )}
      {existentes.length === 0 && !showForm && (
        <p className="mt-1 text-xs text-slate-500">Nenhuma NS cadastrada para hoje.</p>
      )}
      {existentes.map((n) => (
        <div
          key={n.notaServicoId ?? n.codigo}
          className="mt-2 flex items-start justify-between gap-2 rounded border border-slate-200 bg-slate-50 p-2 text-xs"
        >
          <div>
            <p className="font-medium text-cbmes-blue">
              <span className="rounded-full bg-cbmes-blue/15 px-1.5 py-0.5 text-[10px]">
                {n.codigo}
              </span>{' '}
              {n.descricao}
            </p>
            {(n.horaInicio || n.horaFim) && (
              <p className="text-slate-700">
                {n.horaInicio}–{n.horaFim}
                {n.viaturaPrefixo && <> · 🚒 {n.viaturaPrefixo}</>}
              </p>
            )}
            {n.militares && n.militares.length > 0 && (
              <p className="text-slate-600">👥 {n.militares.map((m) => m.raw).join(', ')}</p>
            )}
            {n.observacoes && <p className="italic text-slate-500">{n.observacoes}</p>}
          </div>
          {n.notaServicoId && (
            <button
              type="button"
              onClick={() => void remover(n)}
              className="rounded border border-feedback-error px-2 py-1 text-feedback-error"
            >
              Remover
            </button>
          )}
        </div>
      ))}

      {showForm ? (
        <div className="mt-3 space-y-2 rounded border border-cbmes-blue/30 bg-white p-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_2fr]">
            <input
              type="text"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              placeholder="Código (ex.: NS077)"
              className="rounded border border-slate-300 px-2 py-2 text-sm"
            />
            <input
              type="text"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Descrição"
              className="rounded border border-slate-300 px-2 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="time"
              value={horaInicio}
              onChange={(e) => setHoraInicio(e.target.value)}
              className="rounded border border-slate-300 px-2 py-2 text-sm"
            />
            <input
              type="time"
              value={horaFim}
              onChange={(e) => setHoraFim(e.target.value)}
              className="rounded border border-slate-300 px-2 py-2 text-sm"
            />
          </div>
          <select
            value={viaturaPrefixo}
            onChange={(e) => setViaturaPrefixo(e.target.value)}
            className="w-full rounded border border-slate-300 px-2 py-2 text-sm"
          >
            <option value="">— Nenhuma viatura</option>
            {viaturasDisponiveis.map((v) => (
              <option key={v.id} value={v.prefixo}>
                {v.prefixo} {v.funcaoOperacional ? `(${v.funcaoOperacional})` : ''}
              </option>
            ))}
          </select>
          <div>
            <p className="text-[10px] uppercase text-slate-500">Militares ({militares.length})</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {militares.map((m) => (
                <span
                  key={m.nf}
                  className="rounded-full bg-cbmes-blue/10 px-2 py-0.5 text-xs text-cbmes-blue"
                >
                  {m.raw}
                  <button
                    type="button"
                    onClick={() => setMilitares(militares.filter((x) => x.nf !== m.nf))}
                    className="ml-1 text-feedback-error"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div className="mt-1">
              <MilitarSelect
                value={undefined}
                valueRaw={undefined}
                onChange={(nf, m) => {
                  if (!nf || !m) return;
                  if (militares.some((x) => x.nf === nf)) return;
                  setMilitares([
                    ...militares,
                    { nf, raw: `${m.posto} ${m.nomeGuerra ?? m.nome.split(' ')[0]}` },
                  ]);
                }}
                placeholder="+ Adicionar militar"
                excluirNfs={militares.map((m) => m.nf)}
              />
            </div>
          </div>
          <textarea
            rows={2}
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            placeholder="Observações (opcional)"
            className="w-full rounded border border-slate-300 px-2 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void salvar()}
              disabled={saving}
              className="flex-1 rounded-button bg-cbmes-red py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving ? 'Salvando…' : 'Cadastrar NS'}
            </button>
            <button
              type="button"
              onClick={cancelar}
              className="flex-1 rounded-button border border-slate-300 bg-white py-2 text-sm text-slate-700"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="mt-2 rounded border border-cbmes-blue px-3 py-1 text-cbmes-blue"
        >
          + Cadastrar NS
        </button>
      )}
    </fieldset>
  );
}

const RECURSOS_DISPONIVEIS_PARA_ATIVACAO = [
  'CHEFE DE OPERAÇÕES',
  'ABTS_01',
  'ABTS_02',
  'RESGATE 01',
  'RESGATE 02',
  'ATB',
  'PLATAFORMA',
  'GUARDA',
  'MERGULHO 01',
  'MERGULHO 02',
  'SALVAMAR 01',
  'SALVAMAR 02',
  'QUADRICICLO 01',
  'QUADRICICLO 02',
];

/**
 * S0.x/Fix-AtivarRecurso — Card que permite ao Fiscal ativar um recurso
 * do Mapa Força que não está na escala XLSX do dia. Mínimo: recurso +
 * viatura disponível + Chefe. Motorista e operadores opcionais (podem
 * ser adicionados depois). Persiste em `ajustes.ativacoesRecurso`.
 */
function AtivarRecursoCard({
  data,
  previa,
  isReadOnly,
  onSaved,
}: {
  data: string;
  previa: MapaForcaDoDia;
  isReadOnly: boolean;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [viaturas, setViaturas] = useState<Viatura[]>([]);
  const [recurso, setRecurso] = useState('');
  const [vtrPrefixo, setVtrPrefixo] = useState('');
  const [chefeRef, setChefeRef] = useState<{ nf: string; raw: string; postoAbreviado: string; nomeGuerra: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    api
      .viaturasList()
      .then(setViaturas)
      .catch(() => setViaturas([]));
  }, [open]);

  // Recursos NÃO presentes na tripulação atual.
  const recursosFaltando = RECURSOS_DISPONIVEIS_PARA_ATIVACAO.filter(
    (r) => !previa.tripulacao.some((t) => t.viatura === r),
  );

  // Viaturas DISPONÍVEIS e não atribuídas a um recurso já ativo.
  const vtrsEmUso = new Set(previa.tripulacao.map((t) => t.viatura));
  const viaturasLivres = viaturas.filter(
    (v) => v.status === 'DISPONIVEL' && !vtrsEmUso.has(v.prefixo),
  );

  const ativacoesDoDia = previa.ativacoesRecurso.filter((a) => a.data === data);

  const reset = () => {
    setRecurso('');
    setVtrPrefixo('');
    setChefeRef(null);
    setError(null);
  };

  const handleAtivar = async () => {
    if (!recurso || !vtrPrefixo || !chefeRef) {
      setError('Recurso, viatura e Chefe são obrigatórios.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const ajustes = extractAjustes(previa);
      const novas = [
        ...ajustes.ativacoesRecurso,
        {
          data,
          recurso,
          vtrPrefixo,
          chefe: {
            raw: chefeRef.raw,
            postoAbreviado: chefeRef.postoAbreviado,
            nomeGuerra: chefeRef.nomeGuerra,
            nf: chefeRef.nf,
          },
          operadores: [],
        },
      ];
      const res = await fetch(
        `${import.meta.env.VITE_API_URL ?? 'http://localhost:3000'}/mapa-forca/${data}/ajustes`,
        {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...ajustes, ativacoesRecurso: novas }),
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      reset();
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao ativar recurso');
    } finally {
      setSaving(false);
    }
  };

  const handleDesfazer = async (idx: number) => {
    setSaving(true);
    setError(null);
    try {
      const ajustes = extractAjustes(previa);
      const novas = ajustes.ativacoesRecurso.filter((_, i) => i !== idx);
      const res = await fetch(
        `${import.meta.env.VITE_API_URL ?? 'http://localhost:3000'}/mapa-forca/${data}/ajustes`,
        {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...ajustes, ativacoesRecurso: novas }),
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao desfazer');
    } finally {
      setSaving(false);
    }
  };

  if (isReadOnly && ativacoesDoDia.length === 0) return null;

  return (
    <section className="mt-4 rounded border border-cbmes-blue/30 bg-white p-3">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-cbmes-blue">
          ➕ Ativar recurso adicional ({ativacoesDoDia.length} ativos)
        </h3>
        {!isReadOnly && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="text-[11px] font-medium text-cbmes-blue hover:underline"
          >
            {open ? 'Fechar' : 'Abrir'}
          </button>
        )}
      </div>

      {ativacoesDoDia.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs">
          {ativacoesDoDia.map((a) => {
            const idxOriginal = previa.ativacoesRecurso.indexOf(a);
            return (
              <li
                key={`${a.recurso}-${a.vtrPrefixo}`}
                className="flex items-center justify-between gap-2 rounded border border-slate-200 bg-slate-50 p-2"
              >
                <span>
                  <strong>{a.recurso}</strong> · {a.vtrPrefixo} · Ch:{' '}
                  {a.chefe.postoAbreviado} {a.chefe.nomeGuerra}
                </span>
                {!isReadOnly && (
                  <button
                    type="button"
                    onClick={() => void handleDesfazer(idxOriginal)}
                    disabled={saving}
                    className="rounded border border-slate-300 px-2 py-0.5 text-[10px] text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                  >
                    ↶ desfazer
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {open && !isReadOnly && (
        <div className="mt-3 space-y-2">
          <label className="block">
            <span className="text-[10px] uppercase tracking-wide text-slate-500">Recurso</span>
            <select
              value={recurso}
              onChange={(e) => setRecurso(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            >
              <option value="">Selecione…</option>
              {recursosFaltando.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-wide text-slate-500">
              Viatura disponível
            </span>
            <select
              value={vtrPrefixo}
              onChange={(e) => setVtrPrefixo(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            >
              <option value="">Selecione…</option>
              {viaturasLivres.map((v) => (
                <option key={v.id} value={v.prefixo}>
                  {v.prefixo} · {v.tipo}
                </option>
              ))}
            </select>
          </label>
          <div>
            <span className="text-[10px] uppercase tracking-wide text-slate-500">
              Chefe (obrigatório)
            </span>
            <MilitarSelect
              value={chefeRef?.nf}
              onChange={(nf, m) => {
                if (nf && m) {
                  setChefeRef({
                    nf,
                    raw: `${m.posto} ${m.nomeGuerra ?? m.nome}`,
                    postoAbreviado: m.posto.replace(/\s+/g, '').toUpperCase(),
                    nomeGuerra: m.nomeGuerra ?? m.nome,
                  });
                } else setChefeRef(null);
              }}
              placeholder="Buscar Chefe…"
            />
          </div>
          {error && (
            <p className="rounded border border-feedback-error/30 bg-feedback-error/10 p-2 text-xs text-feedback-error">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void handleAtivar()}
              disabled={saving}
              className="flex-1 rounded-button bg-cbmes-red py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving ? 'Ativando…' : 'Ativar'}
            </button>
            <button
              type="button"
              onClick={() => {
                reset();
                setOpen(false);
              }}
              disabled={saving}
              className="flex-1 rounded-button border border-slate-300 bg-white py-2 text-sm text-slate-700"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * S0.x/rename-mapa-forca — Banner que controla a transição de estado da Prévia.
 *
 * Mostra:
 * - Estado atual (NAO_INICIADO / PREVIA_INICIADA / INICIADO+).
 * - Botão "Iniciar Prévia do Mapa Força" se NAO_INICIADO + (Fiscal escalado OR admin).
 * - Botão "Cancelar Prévia" se PREVIA_INICIADA + (iniciador OR admin).
 * - Mensagem informativa quando o usuário não pode interagir naquele estado.
 */
function PreviaEstadoBanner({
  previa,
  podeIniciarPrevia,
  podeCancelarPrevia,
  inflight,
  onIniciarPrevia,
  onCancelarPrevia,
}: {
  previa: MapaForcaDoDia;
  podeIniciarPrevia: boolean;
  podeCancelarPrevia: boolean;
  inflight: boolean;
  onIniciarPrevia: () => void | Promise<void>;
  onCancelarPrevia: () => void | Promise<void>;
}) {
  const estado = previa.estadoServico;
  if (estado === 'NAO_INICIADO') {
    return (
      <div className="mt-3 rounded border border-cbmes-blue/30 bg-cbmes-blue/5 p-3 text-sm text-cbmes-blue">
        <p className="font-semibold">📖 Mapa Força — Não iniciada</p>
        <p className="mt-1 text-xs text-slate-700">
          Nenhuma intervenção foi feita nos dados importados. Visualização somente leitura.
        </p>
        {podeIniciarPrevia ? (
          <>
            <p className="mt-1 text-xs text-slate-700">
              Você é o Fiscal escalado deste dia. Clique abaixo para abrir a edição da
              <strong> Prévia do Mapa Força</strong> (ajustes pré-turno na passagem de serviço).
            </p>
            <button
              type="button"
              onClick={() => void onIniciarPrevia()}
              disabled={inflight}
              className="mt-2 rounded-button bg-cbmes-red px-4 py-2 text-sm font-semibold text-white hover:bg-cbmes-red/90 disabled:opacity-60"
            >
              {inflight ? 'Iniciando…' : 'Iniciar Prévia do Mapa Força'}
            </button>
          </>
        ) : (
          <p className="mt-1 text-xs italic text-slate-600">
            Aguardando o Fiscal escalado iniciar a Prévia para liberar a edição.
            {previa.fiscal?.militarResolvido && (
              <>
                {' '}
                Fiscal: <strong>{previa.fiscal.militarResolvido.posto}{' '}
                {previa.fiscal.militarResolvido.nomeGuerra ??
                  previa.fiscal.militarResolvido.nome.split(' ')[0]}</strong> (NF{' '}
                {previa.fiscal.militarNf}).
              </>
            )}
          </p>
        )}
      </div>
    );
  }

  if (estado === 'PREVIA_INICIADA') {
    return (
      <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        <p className="font-semibold">
          ✏️ Mapa Força — Em prévia
          {previa.previaIniciadaPorNf && (
            <span className="ml-2 text-xs font-normal">
              · iniciada por NF {previa.previaIniciadaPorNf}
            </span>
          )}
        </p>
        {podeCancelarPrevia ? (
          <>
            <p className="mt-1 text-xs">
              Faça os ajustes necessários abaixo. Os ajustes ficam <strong>salvos
              automaticamente</strong> a cada alteração e o Mapa Força permanece em
              <strong> "Em prévia"</strong> até você clicar em <strong>"Iniciar Serviço"</strong>,
              quando os dados são congelados e ficam disponíveis para o preenchimento do
              Mapa Força CIODES e da Parte Diária.
            </p>
            <button
              type="button"
              onClick={() => void onCancelarPrevia()}
              disabled={inflight}
              className="mt-2 rounded-button border border-amber-700 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-60"
            >
              {inflight ? 'Cancelando…' : 'Cancelar Prévia (volta a read-only)'}
            </button>
          </>
        ) : (
          <p className="mt-1 text-xs italic">
            Você visualiza esta Prévia em modo leitura — apenas o Fiscal que iniciou (ou admin)
            pode editá-la.
          </p>
        )}
      </div>
    );
  }

  if (estado === 'ENCERRADO') {
    return (
      <div className="mt-3 rounded border border-slate-300 bg-slate-50 p-3 text-sm text-slate-700">
        <p className="font-semibold">🔒 Serviço encerrado</p>
        <p className="mt-1 text-xs">
          Encerrado pela passagem de serviço. Dados arquivados — consulte a Parte Diária do dia
          para o histórico completo.
        </p>
      </div>
    );
  }

  // INICIADO em diante (incl. EQUIPE_CONFERIDA, VIATURA_CONFERIDA, PREENCHENDO_MF):
  // serviço em andamento; alterações vão para a Parte Diária / livro / MF CIODES.
  return (
    <div className="mt-3 rounded border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
      <p className="font-semibold">
        🚒 Serviço Iniciado — em andamento
      </p>
      <p className="mt-1 text-xs">
        A Prévia foi congelada e os dados estão disponíveis para preenchimento do Mapa Força
        CIODES (não-implementado) e da Parte Diária. <strong>Toda alteração</strong> a partir
        deste momento deve constar em livro na seção específica do tipo de alteração; alterações
        em recursos exigem também atualização no Mapa Força CIODES.
      </p>
      <Link
        to={`/parte-diaria?data=${previa.data}`}
        className="mt-3 inline-block rounded-button bg-cbmes-blue px-4 py-2 text-sm font-semibold text-white hover:bg-cbmes-blue/90"
      >
        📑 Editar Parte Diária do dia
      </Link>
    </div>
  );
}

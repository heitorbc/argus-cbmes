import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  STATUS_ITEM_MATERIAL,
  STATUS_ITEM_MATERIAL_LABEL,
  STATUS_VIATURA,
  STATUS_VIATURA_LABEL,
  type ItemConferenciaMaterial,
  type StatusItemMaterial,
  type StatusViatura,
  type Viatura,
} from '@argus/shared-types';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { STATUS_VIATURA_BADGE } from '@/lib/status-viatura-style';

export function ConferenciaViaturaPage() {
  const { data, vtrPrefixo } = useParams<{ data: string; vtrPrefixo: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.papeis.includes('admin') ?? false;

  const [viatura, setViatura] = useState<Viatura | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [kmAtual, setKmAtual] = useState<string>('');
  const [estadoTanque, setEstadoTanque] = useState<number>(50);
  const [observacao, setObservacao] = useState<string>('');
  const [mudarStatus, setMudarStatus] = useState(false);
  const [statusMudanca, setStatusMudanca] = useState<StatusViatura>('DISPONIVEL');
  const [motivoBaixa, setMotivoBaixa] = useState<string>('');

  // S8 — Conferência de Materiais (seção adicional)
  const [itensMateriais, setItensMateriais] = useState<ItemConferenciaMaterial[]>([]);
  const [savingMateriais, setSavingMateriais] = useState(false);
  const [materiaisOk, setMateriaisOk] = useState(false);

  useEffect(() => {
    if (!vtrPrefixo) return;
    let cancelled = false;
    setLoading(true);
    api
      .viaturasList()
      .then((all) => {
        if (cancelled) return;
        const v = all.find((x) => x.prefixo === decodeURIComponent(vtrPrefixo));
        if (!v) {
          setError(`Viatura ${vtrPrefixo} não encontrada`);
          return;
        }
        setViatura(v);
        if (v.kmAtual) setKmAtual(String(v.kmAtual));
        if (v.estadoTanquePercent !== undefined) setEstadoTanque(v.estadoTanquePercent);
        setStatusMudanca(v.status);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof ApiError ? e.message : 'Erro ao carregar viatura');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [vtrPrefixo]);

  // S8 — Carrega checklist padrão + conferência existente da data/viatura
  useEffect(() => {
    if (!vtrPrefixo || !data) return;
    const decoded = decodeURIComponent(vtrPrefixo);
    let cancelled = false;
    Promise.all([
      api.materiaisChecklistPadrao(decoded).catch(() => [] as string[]),
      api.materiaisGet(data, decoded).catch(() => null),
    ]).then(([padrao, existing]) => {
      if (cancelled) return;
      const existingConf = existing && !Array.isArray(existing) ? existing : null;
      if (existingConf) {
        setItensMateriais(existingConf.itens.map((i) => ({ ...i })));
      } else {
        setItensMateriais(padrao.map((label) => ({ label, status: 'OK' })));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [vtrPrefixo, data]);

  const handleSalvarMateriais = async () => {
    if (!data || !vtrPrefixo || itensMateriais.length === 0) return;
    setSavingMateriais(true);
    setError(null);
    try {
      await api.materiaisRegistrar({
        data,
        vtrPrefixo: decodeURIComponent(vtrPrefixo),
        itens: itensMateriais,
      });
      setMateriaisOk(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erro ao salvar conferência de materiais');
    } finally {
      setSavingMateriais(false);
    }
  };

  const updateItemMaterial = (i: number, patch: Partial<ItemConferenciaMaterial>) => {
    setItensMateriais((arr) => arr.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
    setMateriaisOk(false);
  };

  // S0.x — KM histórico: deriva o último KM registrado a partir do
  // historicoKm (origem 'manual_admin' | 'conferencia' | 'ocorrencia') ou
  // do kmAtual atual da viatura (fallback). Bloqueia decremento; admin
  // pode forçar apenas com observação obrigatória.
  const ultimoKm = (viatura?.historicoKm ?? []).reduce(
    (acc, h) => Math.max(acc, h.kmRegistrado),
    viatura?.kmAtual ?? 0,
  );
  const novoKmNum = kmAtual.trim() ? Number(kmAtual) : undefined;
  const isDecremento = novoKmNum !== undefined && novoKmNum < ultimoKm;
  const decrementoBloqueado = isDecremento && !isAdmin;
  const decrementoExigeObservacao = isDecremento && isAdmin;
  const observacaoFaltando = decrementoExigeObservacao && !observacao.trim();

  const handleSalvar = async () => {
    if (!data || !vtrPrefixo) return;
    if (mudarStatus && statusMudanca === 'BAIXADA' && !motivoBaixa.trim()) {
      setError('Motivo da baixa é obrigatório.');
      return;
    }
    if (decrementoBloqueado) {
      setError(
        `KM informado (${novoKmNum}) é menor que o último registrado (${ultimoKm}). ` +
          `Apenas admin pode forçar decremento.`,
      );
      return;
    }
    if (observacaoFaltando) {
      setError(
        `Decremento de KM (${novoKmNum} < ${ultimoKm}) exige observação obrigatória do admin.`,
      );
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.conferenciaViaturaRegistrar(data, decodeURIComponent(vtrPrefixo), {
        vtrPrefixo: decodeURIComponent(vtrPrefixo),
        kmAtual: kmAtual.trim() ? Number(kmAtual) : undefined,
        estadoTanquePercent: estadoTanque,
        observacao: observacao.trim() || undefined,
        statusMudanca: mudarStatus ? statusMudanca : undefined,
        motivoBaixa: mudarStatus && statusMudanca === 'BAIXADA' ? motivoBaixa : undefined,
      });
      navigate(`/mapa-forca/${data}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erro ao salvar conferência');
    } finally {
      setSaving(false);
    }
  };

  if (!data || !vtrPrefixo) return <p>Parâmetros inválidos.</p>;

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-cbmes-red px-4 py-4 text-white">
        <Link to={`/mapa-forca/${data}`} className="text-sm opacity-90 hover:opacity-100">
          ← Voltar à Prévia
        </Link>
        <h1 className="mt-1 text-lg font-bold">Conferência da Viatura</h1>
        <p className="text-xs opacity-90">
          {decodeURIComponent(vtrPrefixo)} · {data}
        </p>
      </header>

      <section className="mx-auto max-w-2xl p-4">
        {loading && <p className="text-sm text-slate-500">Carregando…</p>}
        {error && (
          <div
            role="alert"
            className="mt-2 rounded border border-feedback-error/30 bg-feedback-error/10 p-3 text-sm text-feedback-error"
          >
            {error}
          </div>
        )}

        {viatura && (
          <div className="space-y-4 rounded border border-cbmes-blue/30 bg-white p-4">
            <div>
              <p className="text-xs uppercase text-slate-500">Status atual</p>
              <span
                className={`mt-1 inline-block rounded-full px-3 py-1 text-sm font-bold uppercase ${STATUS_VIATURA_BADGE[viatura.status]}`}
              >
                {STATUS_VIATURA_LABEL[viatura.status]}
              </span>
            </div>

            <label className="block">
              <span className="text-sm font-medium text-slate-700">KM atual</span>
              <input
                type="number"
                min={0}
                value={kmAtual}
                onChange={(e) => setKmAtual(e.target.value)}
                placeholder="Ex.: 12345"
                className={`mt-1 w-full rounded border px-3 py-2 text-base ${
                  isDecremento ? 'border-feedback-error' : 'border-slate-300'
                }`}
                aria-invalid={isDecremento || undefined}
              />
              <span className="mt-1 block text-xs text-slate-500">
                Último KM registrado: <strong>{ultimoKm.toLocaleString('pt-BR')} km</strong> (deve
                ser ≥ ao último).
              </span>
              {decrementoBloqueado && (
                <span className="mt-1 block text-xs font-semibold text-feedback-error">
                  Decremento permitido apenas para admin com observação obrigatória.
                </span>
              )}
              {decrementoExigeObservacao && (
                <span className="mt-1 block text-xs font-semibold text-amber-700">
                  ⚠ Decremento detectado. Como admin, informe uma observação obrigatória abaixo
                  (será registrada no histórico com origem "manual_admin").
                </span>
              )}
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700">
                Estado do tanque: <strong>{estadoTanque}%</strong>
              </span>
              <input
                type="range"
                min={0}
                max={100}
                value={estadoTanque}
                onChange={(e) => setEstadoTanque(Number(e.target.value))}
                className="mt-1 w-full"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700">
                Observação{decrementoExigeObservacao && ' *'}
              </span>
              <textarea
                rows={3}
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder={
                  decrementoExigeObservacao
                    ? 'Justifique o decremento de KM (ex.: troca de hodômetro)'
                    : 'Ex.: Viatura em ordem; sem novidades.'
                }
                required={decrementoExigeObservacao}
                aria-required={decrementoExigeObservacao || undefined}
                className={`mt-1 w-full rounded border px-3 py-2 text-base ${
                  observacaoFaltando ? 'border-feedback-error' : 'border-slate-300'
                }`}
              />
            </label>

            <fieldset className="rounded border border-amber-300 bg-amber-50 p-3 text-xs">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={mudarStatus}
                  onChange={(e) => setMudarStatus(e.target.checked)}
                  className="h-5 w-5"
                />
                <span className="text-sm font-medium">Alterar status durante o serviço (raro)</span>
              </label>
              {mudarStatus && (
                <div className="mt-2 space-y-2">
                  <select
                    value={statusMudanca}
                    onChange={(e) => setStatusMudanca(e.target.value as StatusViatura)}
                    className="w-full rounded border border-slate-300 px-2 py-1.5"
                  >
                    {STATUS_VIATURA.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_VIATURA_LABEL[s]}
                      </option>
                    ))}
                  </select>
                  {statusMudanca === 'BAIXADA' && (
                    <input
                      type="text"
                      value={motivoBaixa}
                      onChange={(e) => setMotivoBaixa(e.target.value)}
                      placeholder="Motivo da baixa (obrigatório)"
                      required
                      className="w-full rounded border border-slate-300 px-2 py-1.5"
                    />
                  )}
                </div>
              )}
            </fieldset>

            {viatura.observacoesDataDas && viatura.observacoesDataDas.length > 0 && (
              <div className="rounded bg-slate-50 p-3">
                <p className="text-xs font-semibold text-slate-700">Histórico de observações</p>
                <ul className="mt-1 space-y-1 text-xs text-slate-600">
                  {viatura.observacoesDataDas.slice(-5).map((o, i) => (
                    <li key={i}>
                      <span className="text-slate-500">
                        [{new Date(o.data).toLocaleString('pt-BR')} · NF {o.registradoPorNf}]
                      </span>{' '}
                      {o.texto}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {viatura.historicoKm && viatura.historicoKm.length > 0 && (
              <div className="rounded bg-slate-50 p-3">
                <p className="text-xs font-semibold text-slate-700">Histórico de KM</p>
                <ul className="mt-1 space-y-1 text-xs text-slate-600">
                  {[...viatura.historicoKm]
                    .sort(
                      (a, b) =>
                        new Date(b.registradoEm).getTime() - new Date(a.registradoEm).getTime(),
                    )
                    .slice(0, 5)
                    .map((h, i) => (
                      <li key={i}>
                        <span className="text-slate-500">
                          [{new Date(h.registradoEm).toLocaleString('pt-BR')} · NF{' '}
                          {h.registradoPorNf} · {h.origem}]
                        </span>{' '}
                        <strong>{h.kmRegistrado.toLocaleString('pt-BR')} km</strong>
                      </li>
                    ))}
                </ul>
              </div>
            )}

            {/* S8 — Conferência de Materiais */}
            {itensMateriais.length > 0 && (
              <fieldset className="rounded border border-cbmes-blue/40 bg-white p-3">
                <legend className="text-sm font-semibold text-cbmes-blue">
                  Conferência de Materiais
                </legend>
                <p className="text-[11px] text-slate-500">
                  Marque o estado de cada item da carga. Itens ≠ OK alimentam a seção "Alteração de
                  Almoxarifado" da Parte Diária.
                </p>
                <ul className="mt-2 space-y-2">
                  {itensMateriais.map((item, i) => (
                    <li
                      key={i}
                      className="flex flex-wrap items-center gap-2 rounded border border-slate-200 bg-slate-50 p-2"
                    >
                      <span className="flex-1 min-w-[60%] text-sm">{item.label}</span>
                      <select
                        value={item.status}
                        onChange={(e) =>
                          updateItemMaterial(i, { status: e.target.value as StatusItemMaterial })
                        }
                        className="rounded border border-slate-300 px-2 py-1 text-xs"
                      >
                        {STATUS_ITEM_MATERIAL.map((s) => (
                          <option key={s} value={s}>
                            {STATUS_ITEM_MATERIAL_LABEL[s]}
                          </option>
                        ))}
                      </select>
                      {item.status !== 'OK' && (
                        <input
                          type="text"
                          value={item.observacao ?? ''}
                          onChange={(e) =>
                            updateItemMaterial(i, { observacao: e.target.value || undefined })
                          }
                          placeholder="Observação"
                          className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                        />
                      )}
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSalvarMateriais}
                    disabled={savingMateriais}
                    className="rounded border border-cbmes-blue px-3 py-1 text-xs font-medium text-cbmes-blue hover:bg-cbmes-blue/10 disabled:opacity-50"
                  >
                    {savingMateriais ? 'Salvando…' : 'Salvar materiais'}
                  </button>
                  {materiaisOk && (
                    <span className="text-xs text-emerald-700">✓ Materiais conferidos.</span>
                  )}
                </div>
              </fieldset>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={handleSalvar}
                disabled={saving || decrementoBloqueado || observacaoFaltando}
                className="flex-1 rounded-button bg-cbmes-red py-2 text-base font-semibold text-white disabled:opacity-60"
              >
                {saving ? 'Salvando…' : 'Salvar conferência'}
              </button>
              <Link
                to={`/mapa-forca/${data}`}
                className="flex-1 rounded-button border border-slate-300 bg-white py-2 text-center text-base text-slate-700"
              >
                Cancelar
              </Link>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

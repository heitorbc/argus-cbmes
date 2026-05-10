import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  STATUS_VIATURA,
  STATUS_VIATURA_LABEL,
  type StatusViatura,
  type Viatura,
} from '@argus/shared-types';
import { ApiError, api } from '@/lib/api';

export function ConferenciaViaturaPage() {
  const { data, vtrPrefixo } = useParams<{ data: string; vtrPrefixo: string }>();
  const navigate = useNavigate();

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

  const handleSalvar = async () => {
    if (!data || !vtrPrefixo) return;
    if (mudarStatus && statusMudanca === 'BAIXADA' && !motivoBaixa.trim()) {
      setError('Motivo da baixa é obrigatório.');
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
      navigate(`/previa?data=${data}`);
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
        <Link to={`/previa?data=${data}`} className="text-sm opacity-90 hover:opacity-100">
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
              <p className="text-base font-bold">{STATUS_VIATURA_LABEL[viatura.status]}</p>
            </div>

            <label className="block">
              <span className="text-sm font-medium text-slate-700">KM atual</span>
              <input
                type="number"
                min={0}
                value={kmAtual}
                onChange={(e) => setKmAtual(e.target.value)}
                placeholder="Ex.: 12345"
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-base"
              />
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
              <span className="text-sm font-medium text-slate-700">Observação</span>
              <textarea
                rows={3}
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Ex.: Viatura em ordem; sem novidades."
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-base"
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

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={handleSalvar}
                disabled={saving}
                className="flex-1 rounded-button bg-cbmes-red py-2 text-base font-semibold text-white disabled:opacity-60"
              >
                {saving ? 'Salvando…' : 'Salvar conferência'}
              </button>
              <Link
                to={`/previa?data=${data}`}
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

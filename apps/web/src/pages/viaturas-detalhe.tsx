import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  STATUS_VIATURA_LABEL,
  type RecursoMapaForca,
  type UpdateViaturaInput,
  type ViaturaDetalhe,
} from '@argus/shared-types';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { STATUS_VIATURA_BADGE } from '@/lib/status-viatura-style';

interface FormState {
  kmAtual: string;
  usaArla32: boolean;
  capacidadeTanqueArlaLitros: string;
  capacidadeTanqueLitros: string;
  estadoTanquePercent: string;
  alturaMetros: string;
  larguraMetros: string;
  observacoes: string;
}

function fromDetalhe(detalhe: ViaturaDetalhe): FormState {
  const i = detalhe.interno;
  return {
    kmAtual: i?.kmAtual !== undefined ? String(i.kmAtual) : '',
    usaArla32: i?.usaArla32 ?? false,
    capacidadeTanqueArlaLitros:
      i?.capacidadeTanqueArlaLitros !== undefined ? String(i.capacidadeTanqueArlaLitros) : '',
    capacidadeTanqueLitros:
      i?.capacidadeTanqueLitros !== undefined ? String(i.capacidadeTanqueLitros) : '',
    estadoTanquePercent:
      i?.estadoTanquePercent !== undefined ? String(i.estadoTanquePercent) : '',
    alturaMetros: i?.alturaMetros !== undefined ? String(i.alturaMetros) : '',
    larguraMetros: i?.larguraMetros !== undefined ? String(i.larguraMetros) : '',
    observacoes: i?.observacoes ?? '',
  };
}

/**
 * Monta payload do PUT. NÃO inclui `funcaoOperacional` (vem do Mapa Força,
 * read-only nesta tela), nem `tipoCombustivel` (já visível na seção QDV),
 * nem `militarResponsavelNf` (responsável logístico já no cabeçalho via QDV).
 * Os valores armazenados desses campos permanecem intocados — backend faz
 * partial update (campos undefined não limpam o storage).
 */
function toPayload(form: FormState): UpdateViaturaInput {
  const num = (s: string): number | undefined => {
    const trimmed = s.trim();
    if (trimmed === '') return undefined;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : undefined;
  };
  return {
    kmAtual: num(form.kmAtual),
    usaArla32: form.usaArla32 || undefined,
    capacidadeTanqueArlaLitros: num(form.capacidadeTanqueArlaLitros),
    capacidadeTanqueLitros: num(form.capacidadeTanqueLitros),
    estadoTanquePercent: num(form.estadoTanquePercent),
    alturaMetros: num(form.alturaMetros),
    larguraMetros: num(form.larguraMetros),
    observacoes: form.observacoes.trim() || undefined,
  };
}

export function ViaturasDetalhePage() {
  const { prefixo } = useParams<{ prefixo: string }>();
  const { user } = useAuth();
  const isAdmin = user?.papeis.includes('admin') ?? false;

  const [detalhe, setDetalhe] = useState<ViaturaDetalhe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [historicoOpen, setHistoricoOpen] = useState(false);

  // Recursos do Mapa Força — populam o select read-only "Recurso no Mapa Força".
  // Falha silenciosa: select fica com placeholder "Sem dados do MF".
  const [mfRecursos, setMfRecursos] = useState<RecursoMapaForca[]>([]);
  useEffect(() => {
    let cancelled = false;
    api
      .mapaForcaRecursos()
      .then((rs) => {
        if (!cancelled) setMfRecursos(rs);
      })
      .catch(() => {
        if (!cancelled) setMfRecursos([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const [reloadKey, setReloadKey] = useState(0);
  const reload = (): void => setReloadKey((k) => k + 1);

  useEffect(() => {
    if (!prefixo) return;
    let cancelled = false;
    setLoading(true);
    api
      .viaturasEnriquecidasDetalhe(prefixo)
      .then((d) => {
        if (cancelled) return;
        setDetalhe(d);
        setForm(fromDetalhe(d));
        setError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof ApiError ? e.message : 'Erro ao carregar viatura');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [prefixo, reloadKey]);

  const historicoKm = useMemo(
    () => (detalhe?.interno?.historicoKm ?? []).slice().reverse(),
    [detalhe],
  );

  const handleSave = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!prefixo || !form) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      await api.viaturasUpsertByPrefixo(prefixo, toPayload(form));
      setSaveMsg('Alterações salvas.');
      reload();
    } catch (err) {
      setSaveMsg(err instanceof ApiError ? err.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-cbmes-red px-4 py-4 text-white">
        <Link to="/cadastros/viaturas" className="text-sm opacity-90 hover:opacity-100">
          ← Voltar para Viaturas
        </Link>
        <h1 className="mt-1 text-lg font-bold">
          {detalhe?.qdv.prefixo ?? prefixo}
          {detalhe?.qdv.nomenclatura && (
            <span className="ml-2 text-sm font-normal opacity-90">
              · {detalhe.qdv.nomenclatura}
            </span>
          )}
        </h1>
        {detalhe?.contatoResponsavel && (
          <p className="mt-1 text-xs opacity-90">
            Responsável logístico: {detalhe.contatoResponsavel.militarResponsavel}
            {detalhe.contatoResponsavel.telefone && ` · 📞 ${detalhe.contatoResponsavel.telefone}`}
          </p>
        )}
      </header>

      <section className="mx-auto max-w-3xl space-y-4 p-4">
        {loading && !detalhe && (
          <p className="text-center text-sm text-slate-500">Carregando…</p>
        )}
        {error && (
          <div
            role="alert"
            className="rounded border border-feedback-error/30 bg-feedback-error/10 p-3 text-sm text-feedback-error"
          >
            {error}
          </div>
        )}

        {detalhe && (
          <>
            <SecaoQdv detalhe={detalhe} />

            {form && (
              <form
                onSubmit={handleSave}
                className="space-y-3 rounded border border-cbmes-blue/30 bg-white p-4"
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold text-cbmes-blue">
                    Dados operacionais
                  </h2>
                  {!isAdmin && (
                    <span className="text-[11px] italic text-slate-500">
                      Leitura — edição restrita a admin
                    </span>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="recurso-mf"
                    className="mb-1 block text-sm font-medium text-slate-700"
                  >
                    Recurso no Mapa Força
                  </label>
                  <select
                    id="recurso-mf"
                    disabled
                    value={
                      mfRecursos.find((r) => r.vtrPrefixo === detalhe?.qdv.prefixo)?.recurso ?? ''
                    }
                    className="w-full rounded border border-slate-300 bg-slate-100 px-3 py-2 text-base"
                  >
                    <option value="">
                      {mfRecursos.length === 0 ? 'Sem dados do MF' : '—'}
                    </option>
                    {mfRecursos.map((r) => (
                      <option key={r.recurso} value={r.recurso}>
                        {r.recurso}
                      </option>
                    ))}
                  </select>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    (definido pelo Mapa Força — não editável)
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">KM atual</span>
                    <input
                      type="number"
                      min={0}
                      disabled={!isAdmin}
                      value={form.kmAtual}
                      onChange={(e) => setForm({ ...form, kmAtual: e.target.value })}
                      className="mt-1 w-full rounded border border-slate-300 px-3 py-2 disabled:bg-slate-100"
                    />
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      Toda alteração gera entrada no histórico abaixo.
                    </p>
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">
                      Estado do tanque (%)
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      disabled={!isAdmin}
                      value={form.estadoTanquePercent}
                      onChange={(e) => setForm({ ...form, estadoTanquePercent: e.target.value })}
                      className="mt-1 w-full rounded border border-slate-300 px-3 py-2 disabled:bg-slate-100"
                    />
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      Atualizado pelo motorista na conferência diária.
                    </p>
                  </label>
                </div>

                <fieldset className="rounded border border-slate-200 p-3">
                  <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Combustível e ARLA32
                  </legend>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="text-sm font-medium text-slate-700">
                        Capacidade combustível (litros)
                      </span>
                      <input
                        type="number"
                        min={0}
                        disabled={!isAdmin}
                        value={form.capacidadeTanqueLitros}
                        onChange={(e) =>
                          setForm({ ...form, capacidadeTanqueLitros: e.target.value })
                        }
                        className="mt-1 w-full rounded border border-slate-300 px-3 py-2 disabled:bg-slate-100"
                      />
                    </label>
                    <label className="flex items-center gap-2 sm:col-span-2">
                      <input
                        type="checkbox"
                        disabled={!isAdmin}
                        checked={form.usaArla32}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            usaArla32: e.target.checked,
                            capacidadeTanqueArlaLitros: e.target.checked
                              ? form.capacidadeTanqueArlaLitros
                              : '',
                          })
                        }
                        className="h-5 w-5 rounded border-slate-300 text-cbmes-red focus:ring-cbmes-red"
                      />
                      <span className="text-sm text-slate-700">Utiliza ARLA32</span>
                    </label>
                    {form.usaArla32 && (
                      <label className="block sm:col-span-2">
                        <span className="text-sm font-medium text-slate-700">
                          Capacidade ARLA32 (litros)
                        </span>
                        <input
                          type="number"
                          min={0}
                          disabled={!isAdmin}
                          value={form.capacidadeTanqueArlaLitros}
                          onChange={(e) =>
                            setForm({ ...form, capacidadeTanqueArlaLitros: e.target.value })
                          }
                          className="mt-1 w-full rounded border border-slate-300 px-3 py-2 disabled:bg-slate-100"
                        />
                      </label>
                    )}
                  </div>
                </fieldset>

                <fieldset className="rounded border border-slate-200 p-3">
                  <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Dimensões
                  </legend>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="text-sm font-medium text-slate-700">Altura (m)</span>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        disabled={!isAdmin}
                        value={form.alturaMetros}
                        onChange={(e) => setForm({ ...form, alturaMetros: e.target.value })}
                        className="mt-1 w-full rounded border border-slate-300 px-3 py-2 disabled:bg-slate-100"
                      />
                    </label>
                    <label className="block">
                      <span className="text-sm font-medium text-slate-700">Largura (m)</span>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        disabled={!isAdmin}
                        value={form.larguraMetros}
                        onChange={(e) => setForm({ ...form, larguraMetros: e.target.value })}
                        className="mt-1 w-full rounded border border-slate-300 px-3 py-2 disabled:bg-slate-100"
                      />
                    </label>
                  </div>
                </fieldset>

                <div>
                  <label
                    htmlFor="obs"
                    className="mb-1 block text-sm font-medium text-slate-700"
                  >
                    Observações
                  </label>
                  <textarea
                    id="obs"
                    rows={3}
                    disabled={!isAdmin}
                    value={form.observacoes}
                    onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                    placeholder="Outras informações relevantes não previstas acima."
                    className="w-full rounded border border-slate-300 px-3 py-2 text-base disabled:bg-slate-100"
                  />
                </div>

                {detalhe.interno?.observacoesDataDas &&
                  detalhe.interno.observacoesDataDas.length > 0 && (
                    <div className="rounded border border-slate-200 bg-slate-50 p-2 text-xs">
                      <p className="font-semibold text-slate-700">
                        Observações datadas (conferências):
                      </p>
                      <ul className="mt-1 space-y-1">
                        {detalhe.interno.observacoesDataDas.map((o, idx) => (
                          <li key={idx} className="text-slate-600">
                            <span className="text-[10px] text-slate-500">
                              {formatDataIso(o.data)} · NF {o.registradoPorNf} —{' '}
                            </span>
                            {o.texto}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                {saveMsg && (
                  <p
                    role="alert"
                    className={`text-sm ${
                      saveMsg === 'Alterações salvas.'
                        ? 'text-emerald-700'
                        : 'text-feedback-error'
                    }`}
                  >
                    {saveMsg}
                  </p>
                )}

                {isAdmin && (
                  <button
                    type="submit"
                    disabled={saving}
                    className="w-full rounded-button bg-cbmes-red py-2 text-base font-semibold text-white disabled:opacity-60"
                  >
                    {saving ? 'Salvando…' : 'Salvar alterações'}
                  </button>
                )}
              </form>
            )}

            <section className="rounded border border-slate-200 bg-white">
              <button
                type="button"
                onClick={() => setHistoricoOpen((v) => !v)}
                className="flex w-full items-center justify-between px-4 py-3 text-left"
              >
                <span className="text-sm font-semibold text-cbmes-blue">
                  Histórico de KM
                  <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-normal text-slate-600">
                    {historicoKm.length}
                  </span>
                </span>
                <span className="text-xs text-slate-500">{historicoOpen ? '▲' : '▼'}</span>
              </button>
              {historicoOpen && (
                <div className="border-t border-slate-200 p-3">
                  {historicoKm.length === 0 ? (
                    <p className="text-xs italic text-slate-500">Sem registros ainda.</p>
                  ) : (
                    <table className="min-w-full text-xs">
                      <thead className="text-slate-600">
                        <tr>
                          <th className="px-2 py-1 text-right">KM</th>
                          <th className="px-2 py-1 text-left">Registrado em</th>
                          <th className="px-2 py-1 text-left">Por (NF)</th>
                          <th className="px-2 py-1 text-left">Origem</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historicoKm.map((h, idx) => (
                          <tr key={idx} className="border-t border-slate-100">
                            <td className="px-2 py-1 text-right font-mono">
                              {h.kmRegistrado.toLocaleString('pt-BR')}
                            </td>
                            <td className="px-2 py-1">{formatDataHoraIso(h.registradoEm)}</td>
                            <td className="px-2 py-1 font-mono">{h.registradoPorNf}</td>
                            <td className="px-2 py-1">
                              <OrigemBadge origem={h.origem} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </section>
          </>
        )}
      </section>
    </main>
  );
}

function SecaoQdv({ detalhe }: { detalhe: ViaturaDetalhe }) {
  const q = detalhe.qdv;
  return (
    <section className="rounded border border-slate-200 bg-white p-3">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-cbmes-blue">
        Identificação (QDV — read-only)
      </h2>
      <dl className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
        <Linha rotulo="Prefixo" valor={q.prefixo} />
        <Linha rotulo="Nomenclatura" valor={q.nomenclatura} />
        <Linha rotulo="OBM" valor={q.obm} />
        <Linha rotulo="Ano" valor={q.ano} />
        <Linha rotulo="Tipo veículo" valor={q.tipoVeiculo} />
        <Linha rotulo="Marca / Modelo" valor={q.marcaModelo} />
        <Linha rotulo="Placa" valor={q.placa} />
        <Linha rotulo="Renavam" valor={q.renavam} />
        <Linha rotulo="Categoria CNH" valor={q.categoriaCnh} />
        <Linha rotulo="Combustível" valor={q.combustivel} />
        <Linha rotulo="Modelo de pneu" valor={q.modeloPneu} />
        <Linha rotulo="Emprego primário" valor={q.empregoPrimario} />
        <Linha rotulo="Emprego secundário" valor={q.empregoSecundario} />
        <Linha rotulo="Status QDV" valor={q.statusQdv} />
        <Linha
          rotulo="Status MF"
          valor={q.statusMf ? STATUS_VIATURA_LABEL[q.statusMf] : undefined}
          badge={q.statusMf ? STATUS_VIATURA_BADGE[q.statusMf] : undefined}
        />
        <Linha rotulo="Emprestada a" valor={q.emprestadaA} />
      </dl>
    </section>
  );
}

function Linha({
  rotulo,
  valor,
  badge,
}: {
  rotulo: string;
  valor?: string;
  badge?: string;
}) {
  if (!valor) return null;
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-slate-100 py-1 last:border-0">
      <dt className="text-xs text-slate-500">{rotulo}</dt>
      <dd className="text-right text-sm font-medium text-slate-800">
        {badge ? (
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge}`}>
            {valor}
          </span>
        ) : (
          valor
        )}
      </dd>
    </div>
  );
}

const ORIGEM_BADGE: Record<string, string> = {
  manual_admin: 'bg-cbmes-blue/15 text-cbmes-blue',
  conferencia: 'bg-emerald-500/15 text-emerald-700',
  ocorrencia: 'bg-amber-500/15 text-amber-800',
};
const ORIGEM_LABEL: Record<string, string> = {
  manual_admin: 'Admin (manual)',
  conferencia: 'Conferência',
  ocorrencia: 'Ocorrência',
};

function OrigemBadge({ origem }: { origem: string }) {
  const cls = ORIGEM_BADGE[origem] ?? 'bg-slate-200 text-slate-700';
  const label = ORIGEM_LABEL[origem] ?? origem;
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${cls}`}>{label}</span>
  );
}

function formatDataIso(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('pt-BR');
  } catch {
    return iso;
  }
}

function formatDataHoraIso(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-BR');
  } catch {
    return iso;
  }
}

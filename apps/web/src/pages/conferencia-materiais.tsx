import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  STATUS_CONFERENCIA_MATERIAL,
  STATUS_CONFERENCIA_MATERIAL_LABEL,
  type CompartimentoMaterial,
  type ItemConferenciaMaterialV2,
  type StatusConferenciaMaterial,
} from '@argus/shared-types';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

/**
 * S2.10.6 — Conferência de Materiais (separada da Conferência da Viatura).
 *
 * Qualquer militar escalado (papel `militar`) pode conferir materiais de
 * uma viatura ou local específico. Não bloqueia o início do serviço —
 * pode ser feita depois do MF CIODES.
 *
 * Seleciona contexto (viatura/local) → mostra compartimentos com lista
 * de materiais esperados → marca OK/AUSENTE/DANIFICADO + observação
 * opcional → grava.
 */
export function ConferenciaMateriaisPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();

  const dataParam = params.get('data') ?? new Date().toISOString().slice(0, 10);
  const contextoParam = params.get('contexto') ?? '';

  const [compartimentos, setCompartimentos] = useState<CompartimentoMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [itensConferidos, setItensConferidos] = useState<ItemConferenciaMaterialV2[]>([]);
  const [observacao, setObservacao] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);

  useEffect(() => {
    setLoading(true);
    api
      .compartimentosMateriaisList()
      .then((rows) => setCompartimentos(rows.filter((c) => c.ativo)))
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Erro ao carregar compartimentos'))
      .finally(() => setLoading(false));
  }, []);

  const contextosUnicos = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of compartimentos) map.set(c.contexto, c.contextoLabel);
    return Array.from(map.entries()).map(([contexto, label]) => ({ contexto, label }));
  }, [compartimentos]);

  const compartimentosDoContexto = useMemo(
    () => compartimentos.filter((c) => c.contexto === contextoParam),
    [compartimentos, contextoParam],
  );

  // Carrega conferência existente ou inicializa com OK
  useEffect(() => {
    if (!contextoParam || compartimentosDoContexto.length === 0) {
      setItensConferidos([]);
      return;
    }
    api
      .conferenciaMaterialV2Get(dataParam, contextoParam)
      .then((existing) => {
        if (existing) {
          setItensConferidos(existing.itens);
          setObservacao(existing.observacao ?? '');
        } else {
          const itens: ItemConferenciaMaterialV2[] = [];
          for (const c of compartimentosDoContexto) {
            for (const material of c.materiais) {
              itens.push({
                compartimentoId: c.id,
                material,
                status: 'OK',
              });
            }
          }
          setItensConferidos(itens);
          setObservacao('');
        }
        setSavedOk(false);
      })
      .catch(() => undefined);
  }, [dataParam, contextoParam, compartimentosDoContexto]);

  const setContexto = (ctx: string) => {
    const next = new URLSearchParams(params);
    next.set('data', dataParam);
    if (ctx) next.set('contexto', ctx);
    else next.delete('contexto');
    setParams(next);
  };

  const setData = (data: string) => {
    const next = new URLSearchParams(params);
    next.set('data', data);
    if (contextoParam) next.set('contexto', contextoParam);
    setParams(next);
  };

  const updateItem = (i: number, patch: Partial<ItemConferenciaMaterialV2>) => {
    setItensConferidos((arr) => arr.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
    setSavedOk(false);
  };

  const handleSalvar = async () => {
    if (!contextoParam || itensConferidos.length === 0) return;
    const itensNokSemObs = itensConferidos.filter(
      (i) => i.status !== 'OK' && !i.observacao?.trim(),
    );
    if (itensNokSemObs.length > 0) {
      setError(`${itensNokSemObs.length} item(s) não-OK precisam de observação.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.conferenciaMaterialV2Registrar({
        data: dataParam,
        contexto: contextoParam,
        itens: itensConferidos,
        observacao: observacao.trim() || undefined,
      });
      setSavedOk(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erro ao salvar conferência');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-cbmes-blue px-4 py-4 text-white">
        <Link to="/" className="text-sm opacity-90 hover:opacity-100">
          ← Home
        </Link>
        <h1 className="mt-1 text-lg font-bold">📦 Conferência de Materiais</h1>
        <p className="text-xs opacity-90">
          Verifique o material em viaturas ou locais · qualquer militar escalado pode realizar
        </p>
      </header>

      <section className="mx-auto max-w-3xl space-y-4 p-4">
        {error && (
          <div
            role="alert"
            className="rounded border border-feedback-error/30 bg-feedback-error/10 p-3 text-sm text-feedback-error"
          >
            {error}
          </div>
        )}

        <div className="rounded border border-slate-200 bg-white p-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs uppercase tracking-wide text-slate-500">Data</span>
              <input
                type="date"
                value={dataParam}
                onChange={(e) => setData(e.target.value)}
                className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs uppercase tracking-wide text-slate-500">
                Viatura ou local
              </span>
              <select
                value={contextoParam}
                onChange={(e) => setContexto(e.target.value)}
                className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm"
              >
                <option value="">— Selecione —</option>
                {contextosUnicos.map((c) => (
                  <option key={c.contexto} value={c.contexto}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {user?.papeis.includes('admin') && (
            <p className="mt-2 text-xs text-slate-500">
              Admin pode cadastrar/editar compartimentos em{' '}
              <Link
                to="/configuracoes/compartimentos-materiais"
                className="text-cbmes-blue hover:underline"
              >
                /configuracoes/compartimentos-materiais
              </Link>
              .
            </p>
          )}
        </div>

        {loading && <p className="text-sm text-slate-500">Carregando compartimentos…</p>}

        {!loading && contextoParam && compartimentosDoContexto.length === 0 && (
          <p className="rounded border border-dashed border-slate-300 bg-white p-4 text-center text-sm text-slate-500">
            Nenhum compartimento cadastrado para esse contexto. Admin precisa configurar.
          </p>
        )}

        {!loading && contextoParam && compartimentosDoContexto.length > 0 && (
          <>
            <ul className="space-y-3">
              {compartimentosDoContexto.map((comp) => {
                const itensDoComp = itensConferidos.filter((i) => i.compartimentoId === comp.id);
                return (
                  <li key={comp.id} className="rounded border border-slate-200 bg-white p-3">
                    <h3 className="text-sm font-bold text-cbmes-blue">{comp.compartimento}</h3>
                    <ul className="mt-2 space-y-2">
                      {itensDoComp.map((item) => {
                        const idxGlobal = itensConferidos.findIndex((x) => x === item);
                        return (
                          <li
                            key={`${comp.id}-${item.material}`}
                            className="flex flex-wrap items-start gap-2 rounded border border-slate-200 bg-slate-50 p-2"
                          >
                            <span className="flex-1 min-w-[50%] text-sm">{item.material}</span>
                            <select
                              value={item.status}
                              onChange={(e) =>
                                updateItem(idxGlobal, {
                                  status: e.target.value as StatusConferenciaMaterial,
                                })
                              }
                              className="rounded border border-slate-300 px-2 py-1 text-xs"
                            >
                              {STATUS_CONFERENCIA_MATERIAL.map((s) => (
                                <option key={s} value={s}>
                                  {STATUS_CONFERENCIA_MATERIAL_LABEL[s]}
                                </option>
                              ))}
                            </select>
                            {item.status !== 'OK' && (
                              <input
                                type="text"
                                value={item.observacao ?? ''}
                                onChange={(e) =>
                                  updateItem(idxGlobal, {
                                    observacao: e.target.value || undefined,
                                  })
                                }
                                placeholder="Observação obrigatória"
                                className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                              />
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                );
              })}
            </ul>

            <div className="rounded border border-slate-200 bg-white p-3">
              <label className="block">
                <span className="text-xs uppercase tracking-wide text-slate-500">
                  Observação geral (opcional)
                </span>
                <textarea
                  rows={2}
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm"
                />
              </label>
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSalvar}
                  disabled={saving}
                  className="flex-1 rounded-button bg-cbmes-blue py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {saving
                    ? 'Salvando…'
                    : savedOk
                      ? '✓ Salvo (pode editar e salvar de novo)'
                      : 'Salvar conferência'}
                </button>
                <button
                  type="button"
                  onClick={() => navigate(-1)}
                  className="rounded-button border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700"
                >
                  Voltar
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </main>
  );
}

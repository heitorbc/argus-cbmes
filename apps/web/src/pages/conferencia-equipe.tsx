import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  STATUS_CONFERENCIA,
  STATUS_CONFERENCIA_LABEL,
  type ComposicaoMfMilitar,
  type ConferenciaEquipeEntry,
  type PreviaDoDia,
  type StatusConferencia,
} from '@argus/shared-types';
import { ApiError, api } from '@/lib/api';
import { MilitarSelect } from '@/components/militar-select';

interface MarcacaoForm {
  recurso: string;
  funcao: string;
  militarOriginalNf: string;
  militarLabel: string;
  statusConferencia: StatusConferencia;
  substitutoNf?: string;
  substitutoRaw?: string;
  motivo?: string;
}

const STATUS_BADGE: Record<StatusConferencia, string> = {
  pendente: 'bg-slate-200 text-slate-700',
  presente: 'bg-emerald-100 text-emerald-800',
  substituido: 'bg-cbmes-blue/15 text-cbmes-blue',
  ausente: 'bg-feedback-error/15 text-feedback-error',
};

export function ConferenciaEquipePage() {
  const { data } = useParams<{ data: string }>();
  const navigate = useNavigate();

  const [previa, setPrevia] = useState<PreviaDoDia | null>(null);
  const [marcacoes, setMarcacoes] = useState<MarcacaoForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([api.previaDoDia(data), api.conferenciaEquipeGet(data)])
      .then(([p, existing]) => {
        if (cancelled) return;
        setPrevia(p);
        setMarcacoes(buildMarcacoesFromPrevia(p, existing));
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

  const totais = useMemo(() => {
    const t = { total: marcacoes.length, pendentes: 0, presentes: 0, substituidos: 0, ausentes: 0 };
    for (const m of marcacoes) {
      if (m.statusConferencia === 'pendente') t.pendentes++;
      else if (m.statusConferencia === 'presente') t.presentes++;
      else if (m.statusConferencia === 'substituido') t.substituidos++;
      else if (m.statusConferencia === 'ausente') t.ausentes++;
    }
    return t;
  }, [marcacoes]);

  const handleSalvar = async () => {
    if (!data) return;
    setSaving(true);
    setError(null);
    try {
      const entries = marcacoes.map((m) => ({
        recurso: m.recurso,
        funcao: m.funcao,
        militarOriginalNf: m.militarOriginalNf,
        statusConferencia: m.statusConferencia,
        substitutoNf: m.substitutoNf,
        substitutoRaw: m.substitutoRaw,
        motivo: m.motivo,
      }));
      await api.conferenciaEquipeUpsert(data, { entries });
      navigate(`/previa?data=${data}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erro ao salvar conferência');
    } finally {
      setSaving(false);
    }
  };

  if (!data) return <p>Data inválida.</p>;

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-cbmes-red px-4 py-4 text-white">
        <Link to={`/previa?data=${data}`} className="text-sm opacity-90 hover:opacity-100">
          ← Voltar à Prévia
        </Link>
        <h1 className="mt-1 text-lg font-bold">Conferência da Equipe</h1>
        <p className="text-xs opacity-90">
          {data} {previa?.equipe ? `· Equipe ${previa.equipe} (${previa.equipeNome})` : ''}
        </p>
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

        {!loading && marcacoes.length === 0 && (
          <p className="rounded border border-dashed border-slate-300 bg-white p-4 text-center text-sm text-slate-500">
            Nenhuma composição rotativa encontrada para este dia.
          </p>
        )}

        {marcacoes.length > 0 && (
          <>
            <div className="rounded border border-slate-200 bg-white p-3 text-xs">
              <p>
                <strong>{totais.total}</strong> militares · {totais.presentes} presentes ·{' '}
                {totais.substituidos} substituídos · {totais.ausentes} ausentes ·{' '}
                <span className="text-amber-700">{totais.pendentes} pendentes</span>
              </p>
            </div>

            <ul className="mt-3 divide-y divide-slate-200 rounded border border-slate-200 bg-white">
              {marcacoes.map((m, i) => (
                <li key={`${m.recurso}|${m.funcao}|${m.militarOriginalNf}`} className="p-3 text-sm">
                  <div className="flex items-baseline justify-between gap-2">
                    <span>
                      <strong>{m.militarLabel}</strong>{' '}
                      <span className="text-xs text-slate-500">
                        {m.recurso} · {m.funcao}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[m.statusConferencia]}`}
                    >
                      {STATUS_CONFERENCIA_LABEL[m.statusConferencia]}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {STATUS_CONFERENCIA.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => atualizar(i, { statusConferencia: s })}
                        className={`rounded-button px-3 py-1.5 text-xs font-medium ${
                          m.statusConferencia === s
                            ? 'bg-cbmes-red text-white'
                            : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {STATUS_CONFERENCIA_LABEL[s]}
                      </button>
                    ))}
                  </div>
                  {m.statusConferencia === 'substituido' && (
                    <div className="mt-2 space-y-2">
                      <div>
                        <p className="text-[10px] text-slate-500">Substituto</p>
                        <MilitarSelect
                          value={m.substitutoNf}
                          valueRaw={m.substitutoRaw}
                          onChange={(nf, militar) =>
                            atualizar(i, {
                              substitutoNf: nf ?? undefined,
                              substitutoRaw: militar
                                ? `${militar.posto} ${militar.nomeGuerra ?? militar.nome.split(' ')[0]}`
                                : undefined,
                            })
                          }
                          excluirNfs={[m.militarOriginalNf]}
                          placeholder="Buscar substituto"
                        />
                      </div>
                      <input
                        type="text"
                        value={m.motivo ?? ''}
                        onChange={(e) => atualizar(i, { motivo: e.target.value })}
                        placeholder="Motivo (opcional)"
                        className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs"
                      />
                    </div>
                  )}
                  {m.statusConferencia === 'ausente' && (
                    <input
                      type="text"
                      value={m.motivo ?? ''}
                      onChange={(e) => atualizar(i, { motivo: e.target.value })}
                      placeholder="Motivo da ausência (opcional)"
                      className="mt-2 w-full rounded border border-slate-300 px-2 py-1.5 text-xs"
                    />
                  )}
                </li>
              ))}
            </ul>

            <div className="mt-4 flex gap-2">
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
          </>
        )}
      </section>
    </main>
  );

  function atualizar(i: number, patch: Partial<MarcacaoForm>): void {
    setMarcacoes((prev) => {
      const next = [...prev];
      next[i] = { ...next[i]!, ...patch };
      return next;
    });
  }
}

function buildMarcacoesFromPrevia(
  previa: PreviaDoDia,
  existing: ConferenciaEquipeEntry[],
): MarcacaoForm[] {
  const existingByKey = new Map(
    existing.map((e) => [`${e.recurso}|${e.funcao}|${e.militarOriginalNf}`, e]),
  );

  const out: MarcacaoForm[] = [];
  for (const entry of previa.composicaoMf) {
    if (entry.equipe === null || entry.equipe === 'AQUATICAS' || entry.equipe === 'STAFF') continue;
    if (entry.chefe) push(entry.recurso, 'Ch', entry.chefe);
    if (entry.motorista) push(entry.recurso, 'Mot', entry.motorista);
    entry.operadores.forEach((op, i) => push(entry.recurso, `Op${i + 1}`, op));
  }
  return out;

  function push(recurso: string, funcao: string, militar: ComposicaoMfMilitar): void {
    const nf = militar.militarResolvido?.nf;
    if (!nf) return; // sem NF, não conferimos
    const key = `${recurso}|${funcao}|${nf}`;
    const ex = existingByKey.get(key);
    out.push({
      recurso,
      funcao,
      militarOriginalNf: nf,
      militarLabel: `${militar.postoAbreviado} ${militar.nomeGuerra}`,
      statusConferencia: ex?.statusConferencia ?? 'pendente',
      substitutoNf: ex?.substitutoNf,
      substitutoRaw: ex?.substitutoRaw,
      motivo: ex?.motivo,
    });
  }
}

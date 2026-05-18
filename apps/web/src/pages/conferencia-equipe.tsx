import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  STATUS_CONFERENCIA,
  STATUS_CONFERENCIA_EQUIPE_LABEL,
  STATUS_CONFERENCIA_LABEL,
  type ComposicaoMfMilitar,
  type ConferenciaEquipeEntry,
  type MapaForcaDoDia,
  type StatusConferencia,
  type StatusConferenciaEquipe,
} from '@argus/shared-types';
import { ApiError, api } from '@/lib/api';
import { MilitarSelect } from '@/components/militar-select';
import {
  STATUS_CONFERENCIA_EQUIPE_BADGE,
  STATUS_CONFERENCIA_EQUIPE_CARD,
} from '@/lib/status-conferencia-style';

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

/**
 * S6h/2.1 — Conferência da Equipe agora é por equipe (recurso), não mais
 * por militar individual. Cada recurso vira um card com badge agregado
 * (nao_conferida/em_conferencia/conferida). Click → modal com checklist
 * dos militares e botão "Confirmar equipe".
 */
export function ConferenciaEquipePage() {
  const { data } = useParams<{ data: string }>();
  const [searchParams] = useSearchParams();
  const recursoFoco = searchParams.get('recurso');
  const navigate = useNavigate();

  const [previa, setPrevia] = useState<MapaForcaDoDia | null>(null);
  const [marcacoes, setMarcacoes] = useState<MarcacaoForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [equipeAberta, setEquipeAberta] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([api.mapaForcaDoDia(data), api.conferenciaEquipeGet(data)])
      .then(([p, existing]) => {
        if (cancelled) return;
        setPrevia(p);
        setMarcacoes(buildMarcacoesFromPrevia(p, existing));
        // S0.x — Se ?recurso=X, abre o modal direto naquele recurso.
        if (recursoFoco) setEquipeAberta(recursoFoco);
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
  }, [data, recursoFoco]);

  /** Agrupa marcações por recurso (= equipe). */
  const equipes = useMemo(() => {
    const map = new Map<string, MarcacaoForm[]>();
    for (const m of marcacoes) {
      const list = map.get(m.recurso) ?? [];
      list.push(m);
      map.set(m.recurso, list);
    }
    return Array.from(map.entries()).map(([recurso, militares]) => {
      const status: StatusConferenciaEquipe = militares.every(
        (mm) => mm.statusConferencia !== 'pendente',
      )
        ? 'conferida'
        : militares.some((mm) => mm.statusConferencia !== 'pendente')
          ? 'em_conferencia'
          : 'nao_conferida';
      return { recurso, militares, status };
    });
  }, [marcacoes]);

  const totais = useMemo(() => {
    const t = { equipes: equipes.length, conferidas: 0, em_conferencia: 0, nao_conferidas: 0 };
    for (const e of equipes) {
      if (e.status === 'conferida') t.conferidas++;
      else if (e.status === 'em_conferencia') t.em_conferencia++;
      else t.nao_conferidas++;
    }
    return t;
  }, [equipes]);

  if (!data) return <p>Data inválida.</p>;

  const handleSalvarTudo = async () => {
    if (!data) return;
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
      navigate(`/mapa-forca/${data}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erro ao salvar conferência');
    }
  };

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-cbmes-red px-4 py-4 text-white">
        <Link to={`/mapa-forca/${data}`} className="text-sm opacity-90 hover:opacity-100">
          ← Voltar à Prévia
        </Link>
        <h1 className="mt-1 text-lg font-bold">Conferência do Chefe de Equipe (efetivo)</h1>
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

        {!loading && equipes.length === 0 && (
          <p className="rounded border border-dashed border-slate-300 bg-white p-4 text-center text-sm text-slate-500">
            Nenhuma composição encontrada para este dia. Importe a Escala XLSX da SOS primeiro.
          </p>
        )}

        {equipes.length > 0 && (
          <>
            <div className="rounded border border-slate-200 bg-white p-3 text-xs">
              <p>
                <strong>{totais.equipes}</strong> equipes · {totais.conferidas} conferidas ·{' '}
                {totais.em_conferencia} em conferência ·{' '}
                <span className="text-slate-700">{totais.nao_conferidas} não conferidas</span>
              </p>
            </div>

            <ul className="mt-3 space-y-2">
              {equipes.map((eq) => (
                <li
                  key={eq.recurso}
                  className={`rounded border-2 p-3 ${STATUS_CONFERENCIA_EQUIPE_CARD[eq.status]}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-cbmes-blue">{eq.recurso}</p>
                      <p className="text-xs text-slate-500">
                        {eq.militares.length} militares ·{' '}
                        {eq.militares.filter((m) => m.statusConferencia === 'presente').length}{' '}
                        presentes ·{' '}
                        {eq.militares.filter((m) => m.statusConferencia === 'substituido').length}{' '}
                        substituídos ·{' '}
                        {eq.militares.filter((m) => m.statusConferencia === 'ausente').length}{' '}
                        ausentes
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold uppercase ${STATUS_CONFERENCIA_EQUIPE_BADGE[eq.status]}`}
                    >
                      {STATUS_CONFERENCIA_EQUIPE_LABEL[eq.status]}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEquipeAberta(eq.recurso)}
                    className="mt-2 w-full rounded-button border border-cbmes-blue bg-white py-2 text-sm font-medium text-cbmes-blue hover:bg-cbmes-blue/5"
                  >
                    {eq.status === 'conferida' ? 'Revisar equipe' : 'Conferir equipe'}
                  </button>
                </li>
              ))}
            </ul>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={handleSalvarTudo}
                className="flex-1 rounded-button bg-cbmes-red py-2 text-base font-semibold text-white"
              >
                Salvar e voltar à Prévia
              </button>
              <Link
                to={`/mapa-forca/${data}`}
                className="flex-1 rounded-button border border-slate-300 bg-white py-2 text-center text-base text-slate-700"
              >
                Cancelar
              </Link>
            </div>
          </>
        )}

        {equipeAberta && (
          <EquipeModal
            recurso={equipeAberta}
            militares={marcacoes.filter((m) => m.recurso === equipeAberta)}
            onChange={(idxNoSubset, patch) => {
              const subset = marcacoes.filter((m) => m.recurso === equipeAberta);
              const target = subset[idxNoSubset]!;
              const idxGlobal = marcacoes.indexOf(target);
              setMarcacoes((prev) => {
                const next = [...prev];
                next[idxGlobal] = { ...next[idxGlobal]!, ...patch };
                return next;
              });
            }}
            onConfirm={async () => {
              if (!data) return;
              const entries = marcacoes.map((m) => ({
                recurso: m.recurso,
                funcao: m.funcao,
                militarOriginalNf: m.militarOriginalNf,
                statusConferencia: m.statusConferencia,
                substitutoNf: m.substitutoNf,
                substitutoRaw: m.substitutoRaw,
                motivo: m.motivo,
              }));
              try {
                await api.conferenciaEquipeUpsert(data, { entries });
                setEquipeAberta(null);
              } catch (e) {
                setError(e instanceof ApiError ? e.message : 'Erro ao salvar equipe');
              }
            }}
            onClose={() => setEquipeAberta(null)}
          />
        )}
      </section>
    </main>
  );
}

function EquipeModal({
  recurso,
  militares,
  onChange,
  onConfirm,
  onClose,
}: {
  recurso: string;
  militares: MarcacaoForm[];
  onChange: (idx: number, patch: Partial<MarcacaoForm>) => void;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const todasResolvidas = militares.every((m) => m.statusConferencia !== 'pendente');
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white shadow-xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
          <h2 className="text-base font-bold text-cbmes-blue">Conferência: {recurso}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-500 hover:bg-slate-100"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        <ul className="divide-y divide-slate-200">
          {militares.map((m, i) => (
            <li key={`${m.funcao}|${m.militarOriginalNf}`} className="p-3 text-sm">
              <div className="flex items-baseline justify-between gap-2">
                <span>
                  <strong>{m.militarLabel}</strong>{' '}
                  <span className="text-xs text-slate-500">{m.funcao}</span>
                </span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[m.statusConferencia]}`}
                >
                  {STATUS_CONFERENCIA_LABEL[m.statusConferencia]}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {STATUS_CONFERENCIA.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onChange(i, { statusConferencia: s })}
                    className={`rounded-button px-2.5 py-1 text-xs font-medium ${
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
                  <MilitarSelect
                    value={m.substitutoNf}
                    valueRaw={m.substitutoRaw}
                    onChange={(nf, militar) =>
                      onChange(i, {
                        substitutoNf: nf ?? undefined,
                        substitutoRaw: militar
                          ? `${militar.posto} ${militar.nomeGuerra ?? militar.nome.split(' ')[0]}`
                          : undefined,
                      })
                    }
                    excluirNfs={[m.militarOriginalNf]}
                    placeholder="Buscar substituto"
                  />
                  <input
                    type="text"
                    value={m.motivo ?? ''}
                    onChange={(e) => onChange(i, { motivo: e.target.value })}
                    placeholder="Motivo (opcional)"
                    className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs"
                  />
                </div>
              )}
              {m.statusConferencia === 'ausente' && (
                <input
                  type="text"
                  value={m.motivo ?? ''}
                  onChange={(e) => onChange(i, { motivo: e.target.value })}
                  placeholder="Motivo da ausência (opcional)"
                  className="mt-2 w-full rounded border border-slate-300 px-2 py-1.5 text-xs"
                />
              )}
            </li>
          ))}
        </ul>

        <div className="sticky bottom-0 flex gap-2 border-t border-slate-200 bg-white p-3">
          <button
            type="button"
            disabled={!todasResolvidas || saving}
            onClick={async () => {
              setSaving(true);
              await onConfirm();
              setSaving(false);
            }}
            className="flex-1 rounded-button bg-emerald-600 py-2 text-sm font-semibold text-white disabled:opacity-50"
            title={todasResolvidas ? '' : 'Marque todos os militares antes de confirmar a equipe'}
          >
            {saving ? 'Salvando…' : 'Confirmar equipe'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-button border border-slate-300 bg-white py-2 text-sm text-slate-700"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

function buildMarcacoesFromPrevia(
  previa: MapaForcaDoDia,
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

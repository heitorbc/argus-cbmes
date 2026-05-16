import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type {
  IncidenteBaon,
  ParteDiaria,
  ParteDiariaFaxina,
  ParteDiariaGuardaEntry,
  ParteDiariaLinhaHorario,
  ParteDiariaMilitarRef,
  ParteDiariaOcorrencia,
  ParteDiariaRondaEntry,
  UpsertParteDiariaInput,
} from '@argus/shared-types';
import { useAuth } from '@/lib/auth-context';
import { api, ApiError } from '@/lib/api';

/**
 * S10 — Parte Diária.
 *
 * Carrega o documento composto pela API (rascunho ⊕ override), permite
 * edição inline em todas as seções editáveis e oferece "Imprimir/Salvar PDF"
 * usando o diálogo nativo do navegador. O export server-side (Puppeteer +
 * DOCX) fica para S11.
 */
export function ParteDiariaPage() {
  const { user } = useAuth();
  const isAdmin = user?.papeis.includes('admin') ?? false;
  const isFiscalOuAdmin = user?.papeis.some((p) => p === 'admin' || p === 'fiscal') ?? false;

  const today = new Date().toISOString().slice(0, 10);
  const [searchParams] = useSearchParams();
  const dataInicial = searchParams.get('data') ?? today;
  const [data, setData] = useState(dataInicial);
  const [pd, setPd] = useState<ParteDiaria | null>(null);
  const [draft, setDraft] = useState<UpsertParteDiariaInput>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [downloadingDocx, setDownloadingDocx] = useState(false);
  const [acaoLockEmAndamento, setAcaoLockEmAndamento] = useState(false);

  const finalizada = pd?.finalizadoEm !== null && pd?.finalizadoEm !== undefined;
  // PD lock: enquanto finalizada, ninguém edita (mesmo Fiscal). Só admin reabre.
  const podeEditar = isFiscalOuAdmin && !finalizada;

  const carregar = useCallback(async (d: string) => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.parteDiariaGet(d);
      setPd(r);
      setDraft({});
      setSavedAt(r.ultimaEdicaoEm);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erro ao carregar PD');
      setPd(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void carregar(data);
  }, [data, carregar]);

  const salvar = async () => {
    if (!pd) return;
    setLoading(true);
    setError(null);
    try {
      const r = await api.parteDiariaUpsert(data, draft);
      setPd(r);
      setDraft({});
      setSavedAt(r.ultimaEdicaoEm);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erro ao salvar PD');
    } finally {
      setLoading(false);
    }
  };

  const finalizar = async () => {
    if (!pd) return;
    if (
      !window.confirm(
        'Finalizar a Parte Diária deste dia? Edições ficarão bloqueadas até reabertura por um admin.',
      )
    ) {
      return;
    }
    setAcaoLockEmAndamento(true);
    setError(null);
    try {
      const r = await api.parteDiariaFinalizar(data);
      setPd(r);
      setDraft({});
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erro ao finalizar PD');
    } finally {
      setAcaoLockEmAndamento(false);
    }
  };

  const reabrir = async () => {
    if (!pd) return;
    if (!window.confirm('Reabrir a Parte Diária? O Fiscal poderá editar novamente.')) return;
    setAcaoLockEmAndamento(true);
    setError(null);
    try {
      const r = await api.parteDiariaReabrir(data);
      setPd(r);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erro ao reabrir PD');
    } finally {
      setAcaoLockEmAndamento(false);
    }
  };

  const baixarDocx = async () => {
    if (!pd) return;
    setDownloadingDocx(true);
    setError(null);
    try {
      await api.parteDiariaDownloadDocx(data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erro ao baixar DOCX');
    } finally {
      setDownloadingDocx(false);
    }
  };

  const updateDraft = <K extends keyof UpsertParteDiariaInput>(
    key: K,
    value: UpsertParteDiariaInput[K],
  ) => {
    setDraft((d) => ({ ...d, [key]: value }));
  };

  // helpers para campos texto (mostra draft se houver, senão usa pd[campo])
  const getText = (key: keyof ParteDiaria & keyof UpsertParteDiariaInput): string => {
    if (key in draft && typeof draft[key] === 'string') return draft[key] as string;
    const v = pd?.[key];
    return typeof v === 'string' ? v : '';
  };

  // S0.x/parte-diaria — Viaturas em serviço hoje (para select de Ocorrências).
  const viaturasEmServico = useMemo(() => {
    if (!pd) return [] as string[];
    return pd.escalasOperacionais.filter((e) => e.vtrPrefixo).map((e) => e.vtrPrefixo as string);
  }, [pd]);

  return (
    <main className="min-h-screen bg-slate-50 print:bg-white">
      {/* Toolbar — escondida na impressão */}
      <header className="sticky top-0 z-10 border-b bg-white px-4 py-3 shadow-sm print:hidden">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-3">
          <Link to="/" className="text-sm text-cbmes-blue hover:underline">
            ← Home
          </Link>
          <h1 className="text-lg font-semibold text-cbmes-blue">Parte Diária</h1>
          <input
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          />
          <span className="text-xs text-slate-500">
            {savedAt ? `Última edição: ${new Date(savedAt).toLocaleString('pt-BR')}` : 'Rascunho'}
          </span>
          <div className="ml-auto flex gap-2">
            {podeEditar && (
              <button
                type="button"
                onClick={salvar}
                disabled={loading || Object.keys(draft).length === 0}
                className="rounded bg-cbmes-blue px-3 py-1 text-sm text-white disabled:opacity-50"
              >
                {loading ? 'Salvando…' : 'Salvar'}
              </button>
            )}
            {isFiscalOuAdmin && !finalizada && pd && (
              <button
                type="button"
                onClick={finalizar}
                disabled={acaoLockEmAndamento || Object.keys(draft).length > 0}
                title={
                  Object.keys(draft).length > 0
                    ? 'Salve as edições pendentes antes de finalizar.'
                    : 'Finalizar a Parte Diária e bloquear edições'
                }
                className="rounded bg-cbmes-red px-3 py-1 text-sm text-white disabled:opacity-50"
              >
                {acaoLockEmAndamento ? 'Finalizando…' : 'Finalizar PD'}
              </button>
            )}
            {isAdmin && finalizada && (
              <button
                type="button"
                onClick={reabrir}
                disabled={acaoLockEmAndamento}
                className="rounded border border-amber-500 bg-amber-50 px-3 py-1 text-sm text-amber-800 disabled:opacity-50"
              >
                {acaoLockEmAndamento ? 'Reabrindo…' : 'Reabrir PD'}
              </button>
            )}
            <button
              type="button"
              onClick={baixarDocx}
              disabled={loading || !pd || downloadingDocx}
              className="rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100 disabled:opacity-50"
            >
              {downloadingDocx ? 'Baixando…' : 'Baixar DOCX'}
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              disabled={!pd}
              className="rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100 disabled:opacity-50"
            >
              Imprimir / Salvar PDF
            </button>
          </div>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </header>

      {!pd ? (
        <p className="p-8 text-center text-sm text-slate-500">
          {loading ? 'Carregando…' : error ? '' : 'Selecione uma data.'}
        </p>
      ) : (
        <article className="mx-auto max-w-4xl bg-white p-8 print:max-w-none print:p-0 print:shadow-none">
          {finalizada && (
            <div className="mb-6 rounded border-2 border-emerald-500 bg-emerald-50 p-3 text-center print:hidden">
              <p className="text-sm font-semibold uppercase tracking-wide text-emerald-900">
                ✓ Parte Diária FINALIZADA
              </p>
              <p className="mt-1 text-xs text-emerald-800">
                Por NF {pd.finalizadoPorNf} em{' '}
                {pd.finalizadoEm ? new Date(pd.finalizadoEm).toLocaleString('pt-BR') : ''}. Edições
                bloqueadas até reabertura por admin.
              </p>
            </div>
          )}
          <Cabecalho pd={pd} />

          <Secao titulo="ASSUNÇÃO DE SERVIÇO">
            <Texto
              valor={getText('textoAssuncao')}
              editavel={podeEditar}
              onChange={(v) => updateDraft('textoAssuncao', v)}
            />
          </Secao>

          <Secao titulo="ESCALAS DE SERVIÇO OPERACIONAL">
            <EscalasOperacionaisTabela
              entries={pd.escalasOperacionais}
              kmOverrides={draft.kmInicialPorRecurso ?? {}}
              editavel={podeEditar}
              onKmChange={(recurso, km) =>
                updateDraft('kmInicialPorRecurso', {
                  ...(draft.kmInicialPorRecurso ?? {}),
                  [recurso]: km,
                })
              }
            />
          </Secao>

          <Secao titulo="TROCAS DE SERVIÇO">
            <Texto
              valor={getText('textoTrocas')}
              editavel={podeEditar}
              onChange={(v) => updateDraft('textoTrocas', v)}
            />
          </Secao>

          <Secao titulo="ESCALAS — ESPECIAL | EXTRAORDINÁRIA | ISEO">
            <SubSecao titulo="ESPECIAL">
              <Texto
                valor={getText('textoEscalaEspecial')}
                editavel={podeEditar}
                onChange={(v) => updateDraft('textoEscalaEspecial', v)}
              />
            </SubSecao>
            <SubSecao titulo="EXTRAORDINÁRIA">
              <Texto
                valor={getText('textoEscalaExtraordinaria')}
                editavel={podeEditar}
                onChange={(v) => updateDraft('textoEscalaExtraordinaria', v)}
              />
            </SubSecao>
            <SubSecao titulo="ISEO">
              <Texto
                valor={getText('textoIseo')}
                editavel={podeEditar}
                onChange={(v) => updateDraft('textoIseo', v)}
              />
            </SubSecao>
          </Secao>

          <Secao titulo="ESCALA DE GUARDA">
            <TabelaGuarda
              linhas={draft.escalaGuarda ?? pd.escalaGuarda}
              editavel={podeEditar}
              onChange={(v) => updateDraft('escalaGuarda', v)}
            />
          </Secao>

          <Secao titulo="ESCALA DE FAXINA">
            <TabelaFaxina
              linhas={draft.escalaFaxina ?? pd.escalaFaxina}
              editavel={podeEditar}
              onChange={(v) => updateDraft('escalaFaxina', v)}
            />
          </Secao>

          <Secao titulo="RONDA NOTURNA">
            <TabelaRonda
              linhas={draft.rondaNoturna ?? pd.rondaNoturna}
              editavel={podeEditar}
              onChange={(v) => updateDraft('rondaNoturna', v)}
            />
          </Secao>

          <Secao titulo="PASSAGEM DE SERVIÇO (MANHÃ)">
            <TabelaHorario
              linhas={draft.passagemServicoManha ?? pd.passagemServicoManha}
              editavel={podeEditar}
              onChange={(v) => updateDraft('passagemServicoManha', v)}
              colunas={['Horário', 'Militar', 'Área']}
            />
          </Secao>

          <Secao titulo="ATIVIDADE DE INSTRUÇÃO">
            <Texto
              valor={getText('textoInstrucao')}
              editavel={podeEditar}
              onChange={(v) => updateDraft('textoInstrucao', v)}
            />
          </Secao>

          <Secao titulo="INSPEÇÃO DIÁRIA DE EQUIPAMENTOS OPERACIONAIS (IDEO)">
            <Texto valor={pd.textoIdeoFiscal} editavel={false} onChange={() => {}} />
            <p className="mt-1 text-xs italic text-slate-500 print:hidden">
              Texto gerado automaticamente pelo módulo IDEO (S6i). Edite na tela
              /servico/:data/ideo.
            </p>
          </Secao>

          <Secao titulo="CUMPRIMENTO DE OS / NS / NI / PALESTRA / ORDEM VERBAL">
            <Texto
              valor={getText('textoCumprimentoNs')}
              editavel={podeEditar}
              onChange={(v) => updateDraft('textoCumprimentoNs', v)}
            />
          </Secao>

          <Secao titulo="ALTERAÇÃO DE ALMOXARIFADO">
            <Texto
              valor={getText('textoAlteracaoAlmoxarifado')}
              editavel={podeEditar}
              onChange={(v) => updateDraft('textoAlteracaoAlmoxarifado', v)}
            />
          </Secao>

          <Secao titulo="ALTERAÇÃO DE VIATURAS">
            <Texto
              valor={getText('textoAlteracaoViaturas')}
              editavel={podeEditar}
              onChange={(v) => updateDraft('textoAlteracaoViaturas', v)}
            />
          </Secao>

          <Secao titulo="ALTERAÇÕES DIVERSAS">
            <Texto
              valor={getText('textoAlteracoesDiversas')}
              editavel={podeEditar}
              onChange={(v) => updateDraft('textoAlteracoesDiversas', v)}
            />
          </Secao>

          <Secao titulo="OCORRÊNCIAS CONFECCIONADAS">
            <TabelaOcorrencias
              linhas={draft.ocorrenciasConfeccionadas ?? pd.ocorrenciasConfeccionadas}
              viaturasDisponiveis={viaturasEmServico}
              editavel={podeEditar}
              onChange={(v) => updateDraft('ocorrenciasConfeccionadas', v)}
            />
          </Secao>

          <Secao titulo="OCORRÊNCIAS NÃO CONFECCIONADAS">
            <TabelaOcorrencias
              linhas={draft.ocorrenciasNaoConfeccionadas ?? pd.ocorrenciasNaoConfeccionadas}
              viaturasDisponiveis={viaturasEmServico}
              editavel={podeEditar}
              onChange={(v) => updateDraft('ocorrenciasNaoConfeccionadas', v)}
            />
          </Secao>

          <Secao titulo="PASSAGEM DE SERVIÇO">
            <Texto
              valor={getText('textoPassagemServico')}
              editavel={podeEditar}
              onChange={(v) => updateDraft('textoPassagemServico', v)}
            />
            <FiscaisRodape pd={pd} />
          </Secao>
        </article>
      )}
    </main>
  );
}

function Cabecalho({ pd }: { pd: ParteDiaria }) {
  return (
    <header className="mb-6 text-center">
      <p className="text-xs uppercase tracking-wide text-slate-700">
        Estado do Espírito Santo · Corpo de Bombeiros Militar
      </p>
      <p className="text-xs uppercase tracking-wide text-slate-700">
        Primeira Companhia · 1ª Cia/1º BBM
      </p>
      <h2 className="mt-3 text-base font-bold uppercase">
        Parte Diária da Equipe {pd.equipeNome ?? '?'}
        {pd.equipe ? ` - ${pd.equipe}` : ''}, do dia {formatBr(pd.data)} para o dia{' '}
        {formatBr(pd.proximoDia)}
      </h2>
    </header>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h3 className="border-b-2 border-slate-700 pb-1 text-sm font-bold uppercase tracking-wide text-slate-800">
        {titulo}
      </h3>
      <div className="mt-2 text-sm text-slate-800">{children}</div>
    </section>
  );
}

function SubSecao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">{titulo}:</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function Texto({
  valor,
  editavel,
  onChange,
}: {
  valor: string;
  editavel: boolean | undefined;
  onChange: (v: string) => void;
}) {
  if (!editavel) {
    return <p className="whitespace-pre-wrap text-sm leading-relaxed">{valor}</p>;
  }
  return (
    <textarea
      value={valor}
      onChange={(e) => onChange(e.target.value)}
      rows={Math.max(2, valor.split('\n').length)}
      className="w-full resize-y rounded border border-slate-200 bg-slate-50 p-2 text-sm leading-relaxed print:border-none print:bg-white print:p-0"
    />
  );
}

function EscalasOperacionaisTabela({
  entries,
  kmOverrides,
  editavel,
  onKmChange,
}: {
  entries: ParteDiaria['escalasOperacionais'];
  kmOverrides: Record<string, number | null>;
  editavel: boolean | undefined;
  onKmChange: (recurso: string, km: number | null) => void;
}) {
  if (entries.length === 0) {
    return <p className="text-sm italic text-slate-500">Nenhum recurso operacional no dia.</p>;
  }
  return (
    <table className="w-full border-collapse text-xs">
      <thead className="bg-slate-100 print:bg-white">
        <tr>
          <th className="border border-slate-400 px-2 py-1 text-left">Viatura</th>
          <th className="border border-slate-400 px-2 py-1 text-left">KM Inicial</th>
          <th className="border border-slate-400 px-2 py-1 text-left">Função</th>
          <th className="border border-slate-400 px-2 py-1 text-left">Militar</th>
          <th className="border border-slate-400 px-2 py-1 text-left">Observação</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((e) => {
          const km = e.recurso in kmOverrides ? kmOverrides[e.recurso] : e.kmInicial;
          const baixada = e.vtrStatus === 'BAIXADA';
          const linhasVtr = Math.max(1, e.militares.length);
          return e.militares.length === 0 ? (
            <tr key={e.recurso}>
              <td className="border border-slate-400 px-2 py-1 align-top font-medium">
                {e.recurso}
              </td>
              <td className="border border-slate-400 px-2 py-1 align-top">
                {editavel ? (
                  <input
                    type="number"
                    value={km ?? ''}
                    onChange={(ev) =>
                      onKmChange(e.recurso, ev.target.value ? Number(ev.target.value) : null)
                    }
                    className="w-20 rounded border border-slate-300 px-1 text-xs"
                  />
                ) : (
                  (km ?? '-')
                )}
              </td>
              <td className="border border-slate-400 px-2 py-1 align-top text-slate-500">-</td>
              <td className="border border-slate-400 px-2 py-1 align-top text-slate-500">-</td>
              <td className="border border-slate-400 px-2 py-1 align-top">
                {baixada ? 'VTR BAIXADA' : '-'}
              </td>
            </tr>
          ) : (
            e.militares.map((m, idx) => (
              <tr key={`${e.recurso}-${idx}`}>
                {idx === 0 && (
                  <>
                    <td
                      rowSpan={linhasVtr}
                      className="border border-slate-400 px-2 py-1 align-top font-medium"
                    >
                      {e.recurso}
                    </td>
                    <td rowSpan={linhasVtr} className="border border-slate-400 px-2 py-1 align-top">
                      {editavel ? (
                        <input
                          type="number"
                          value={km ?? ''}
                          onChange={(ev) =>
                            onKmChange(e.recurso, ev.target.value ? Number(ev.target.value) : null)
                          }
                          className="w-20 rounded border border-slate-300 px-1 text-xs"
                        />
                      ) : (
                        (km ?? '-')
                      )}
                    </td>
                  </>
                )}
                <td className="border border-slate-400 px-2 py-1">{m.funcao}</td>
                <td className="border border-slate-400 px-2 py-1">{m.militarRaw}</td>
                <td className="border border-slate-400 px-2 py-1">{m.observacao || '-'}</td>
              </tr>
            ))
          );
        })}
      </tbody>
    </table>
  );
}

function TabelaHorario({
  linhas,
  editavel,
  onChange,
  colunas,
}: {
  linhas: readonly ParteDiariaLinhaHorario[];
  editavel: boolean | undefined;
  onChange: (linhas: ParteDiariaLinhaHorario[]) => void;
  colunas: [string, string, string];
}) {
  if (linhas.length === 0 && !editavel) {
    return <p className="text-sm italic text-slate-500">Não houve.</p>;
  }
  return (
    <div>
      <table className="w-full border-collapse text-xs">
        <thead className="bg-slate-100 print:bg-white">
          <tr>
            {colunas.map((c) => (
              <th key={c} className="border border-slate-400 px-2 py-1 text-left">
                {c}
              </th>
            ))}
            {editavel && <th className="border-0 print:hidden"></th>}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l, i) => (
            <tr key={i}>
              <td className="border border-slate-400 px-2 py-1">
                {editavel ? (
                  <input
                    value={l.horario}
                    onChange={(e) => {
                      const next = [...linhas];
                      next[i] = { ...l, horario: e.target.value };
                      onChange(next);
                    }}
                    className="w-full rounded border border-slate-200 px-1 text-xs"
                  />
                ) : (
                  l.horario
                )}
              </td>
              <td className="border border-slate-400 px-2 py-1">
                {editavel ? (
                  <input
                    value={l.militar}
                    onChange={(e) => {
                      const next = [...linhas];
                      next[i] = { ...l, militar: e.target.value };
                      onChange(next);
                    }}
                    className="w-full rounded border border-slate-200 px-1 text-xs"
                  />
                ) : (
                  l.militar
                )}
              </td>
              <td className="border border-slate-400 px-2 py-1">
                {editavel ? (
                  <input
                    value={l.setorOuArea}
                    onChange={(e) => {
                      const next = [...linhas];
                      next[i] = { ...l, setorOuArea: e.target.value };
                      onChange(next);
                    }}
                    className="w-full rounded border border-slate-200 px-1 text-xs"
                  />
                ) : (
                  l.setorOuArea
                )}
              </td>
              {editavel && (
                <td className="px-2 print:hidden">
                  <button
                    type="button"
                    onClick={() => onChange(linhas.filter((_, j) => j !== i))}
                    className="text-xs text-red-600 hover:underline"
                  >
                    ×
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {editavel && (
        <button
          type="button"
          onClick={() => onChange([...linhas, { horario: '', militar: '', setorOuArea: '' }])}
          className="mt-1 text-xs text-cbmes-blue hover:underline print:hidden"
        >
          + linha
        </button>
      )}
    </div>
  );
}

function TabelaGuarda({
  linhas,
  editavel,
  onChange,
}: {
  linhas: readonly ParteDiariaGuardaEntry[];
  editavel: boolean | undefined;
  onChange: (linhas: ParteDiariaGuardaEntry[]) => void;
}) {
  if (linhas.length === 0 && !editavel) {
    return <p className="text-sm italic text-slate-500">Não houve.</p>;
  }
  return (
    <div>
      <table className="w-full border-collapse text-xs">
        <thead className="bg-slate-100 print:bg-white">
          <tr>
            <th className="border border-slate-400 px-2 py-1 text-left">Horário</th>
            <th className="border border-slate-400 px-2 py-1 text-left">Militar</th>
            <th className="border border-slate-400 px-2 py-1 text-left">Setor</th>
            {editavel && <th className="border-0 print:hidden"></th>}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l, i) => (
            <tr key={i}>
              <td className="border border-slate-400 px-2 py-1">
                {l.horarioInicio} – {l.horarioFim}
              </td>
              <td className="border border-slate-400 px-2 py-1">
                {editavel ? (
                  <input
                    value={l.militarRaw}
                    onChange={(e) => {
                      const next = [...linhas];
                      next[i] = { ...l, militarRaw: e.target.value };
                      onChange(next);
                    }}
                    className="w-full rounded border border-slate-200 px-1 text-xs"
                  />
                ) : (
                  <>
                    {l.militarRaw || '—'}
                    {l.sentinelaSlot && (
                      <span className="ml-1 text-[10px] text-slate-500">
                        (Sent. {l.sentinelaSlot})
                      </span>
                    )}
                  </>
                )}
              </td>
              <td className="border border-slate-400 px-2 py-1">
                {editavel ? (
                  <input
                    value={l.setor}
                    onChange={(e) => {
                      const next = [...linhas];
                      next[i] = { ...l, setor: e.target.value };
                      onChange(next);
                    }}
                    className="w-full rounded border border-slate-200 px-1 text-xs"
                  />
                ) : (
                  l.setor
                )}
              </td>
              {editavel && (
                <td className="px-2 print:hidden">
                  <button
                    type="button"
                    onClick={() => onChange(linhas.filter((_, j) => j !== i))}
                    className="text-xs text-red-600 hover:underline"
                  >
                    ×
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TabelaRonda({
  linhas,
  editavel,
  onChange,
}: {
  linhas: readonly ParteDiariaRondaEntry[];
  editavel: boolean | undefined;
  onChange: (linhas: ParteDiariaRondaEntry[]) => void;
}) {
  if (linhas.length === 0 && !editavel) {
    return <p className="text-sm italic text-slate-500">Não houve.</p>;
  }
  return (
    <div>
      <p className="mb-1 text-[11px] italic text-slate-500 print:hidden">
        Cobre 23:10–05:10 dividido entre os militares disponíveis (Mot ChOp + ABTS + Resgate +
        ATB/Plat). 1 militar por horário.
      </p>
      <table className="w-full border-collapse text-xs">
        <thead className="bg-slate-100 print:bg-white">
          <tr>
            <th className="border border-slate-400 px-2 py-1 text-left">Horário</th>
            <th className="border border-slate-400 px-2 py-1 text-left">Militar</th>
            <th className="border border-slate-400 px-2 py-1 text-left">Área</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l, i) => (
            <tr key={i}>
              <td className="border border-slate-400 px-2 py-1">
                {l.horarioInicio} – {l.horarioFim}
              </td>
              <td className="border border-slate-400 px-2 py-1">
                {editavel ? (
                  <input
                    value={l.militarRaw}
                    onChange={(e) => {
                      const next = [...linhas];
                      next[i] = { ...l, militarRaw: e.target.value };
                      onChange(next);
                    }}
                    className="w-full rounded border border-slate-200 px-1 text-xs"
                  />
                ) : (
                  l.militarRaw || '—'
                )}
              </td>
              <td className="border border-slate-400 px-2 py-1">
                {editavel ? (
                  <input
                    value={l.area}
                    onChange={(e) => {
                      const next = [...linhas];
                      next[i] = { ...l, area: e.target.value };
                      onChange(next);
                    }}
                    className="w-full rounded border border-slate-200 px-1 text-xs"
                  />
                ) : (
                  l.area
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TabelaFaxina({
  linhas,
  editavel,
  onChange,
}: {
  linhas: readonly ParteDiariaFaxina[];
  editavel: boolean | undefined;
  onChange: (linhas: ParteDiariaFaxina[]) => void;
}) {
  if (linhas.length === 0 && !editavel) {
    return <p className="text-sm italic text-slate-500">Não houve.</p>;
  }
  return (
    <div>
      <table className="w-full border-collapse text-xs">
        <thead className="bg-slate-100 print:bg-white">
          <tr>
            <th className="border border-slate-400 px-2 py-1 text-left">Militar</th>
            <th className="border border-slate-400 px-2 py-1 text-left">Local</th>
            {editavel && <th className="border-0 print:hidden"></th>}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l, i) => (
            <tr key={i}>
              <td className="border border-slate-400 px-2 py-1">
                {editavel ? (
                  <input
                    value={l.militar}
                    onChange={(e) => {
                      const next = [...linhas];
                      next[i] = { ...l, militar: e.target.value };
                      onChange(next);
                    }}
                    className="w-full rounded border border-slate-200 px-1 text-xs"
                  />
                ) : (
                  l.militar
                )}
              </td>
              <td className="border border-slate-400 px-2 py-1">
                {editavel ? (
                  <input
                    value={l.local}
                    onChange={(e) => {
                      const next = [...linhas];
                      next[i] = { ...l, local: e.target.value };
                      onChange(next);
                    }}
                    className="w-full rounded border border-slate-200 px-1 text-xs"
                  />
                ) : (
                  l.local
                )}
              </td>
              {editavel && (
                <td className="px-2 print:hidden">
                  <button
                    type="button"
                    onClick={() => onChange(linhas.filter((_, j) => j !== i))}
                    className="text-xs text-red-600 hover:underline"
                  >
                    ×
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {editavel && (
        <button
          type="button"
          onClick={() =>
            onChange([...linhas, { militar: '', local: '', locaisIds: [], militarNf: undefined }])
          }
          className="mt-1 text-xs text-cbmes-blue hover:underline print:hidden"
        >
          + linha
        </button>
      )}
    </div>
  );
}

function TabelaOcorrencias({
  linhas,
  viaturasDisponiveis,
  editavel,
  onChange,
}: {
  linhas: readonly ParteDiariaOcorrencia[];
  viaturasDisponiveis: readonly string[];
  editavel: boolean | undefined;
  onChange: (linhas: ParteDiariaOcorrencia[]) => void;
}) {
  if (linhas.length === 0 && !editavel) {
    return <p className="text-sm italic text-slate-500">Não houve.</p>;
  }
  const updateField = (i: number, patch: Partial<ParteDiariaOcorrencia>) => {
    const next = [...linhas];
    next[i] = { ...linhas[i]!, ...patch };
    onChange(next);
  };
  return (
    <div>
      <table className="w-full border-collapse text-xs">
        <thead className="bg-slate-100 print:bg-white">
          <tr>
            <th className="border border-slate-400 px-2 py-1 text-left">VTR</th>
            <th className="border border-slate-400 px-2 py-1 text-left">Nº BAON</th>
            <th className="border border-slate-400 px-2 py-1 text-left">Código da Ocorrência</th>
            {editavel && <th className="border-0 print:hidden"></th>}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l, i) => (
            <tr key={i}>
              <td className="border border-slate-400 px-2 py-1">
                {editavel ? (
                  <select
                    value={l.vtr}
                    onChange={(e) => updateField(i, { vtr: e.target.value })}
                    className="w-full rounded border border-slate-200 px-1 text-xs"
                  >
                    <option value="">—</option>
                    {viaturasDisponiveis.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                    {l.vtr && !viaturasDisponiveis.includes(l.vtr) && (
                      <option value={l.vtr}>{l.vtr} (manual)</option>
                    )}
                  </select>
                ) : (
                  l.vtr
                )}
              </td>
              <td className="border border-slate-400 px-2 py-1">
                {editavel ? (
                  <input
                    value={l.numeroBaon}
                    onChange={(e) => updateField(i, { numeroBaon: e.target.value })}
                    placeholder="Nº BAON"
                    className="w-full rounded border border-slate-200 px-1 text-xs"
                  />
                ) : (
                  l.numeroBaon
                )}
              </td>
              <td className="border border-slate-400 px-2 py-1">
                {editavel ? (
                  <BaonAutocomplete
                    valorCodigo={l.codigo}
                    valorDescricao={l.descricao}
                    onSelect={(c, d) => updateField(i, { codigo: c, descricao: d })}
                  />
                ) : (
                  <>
                    <strong>{l.codigo}</strong>
                    {l.descricao && <span className="ml-1">— {l.descricao}</span>}
                  </>
                )}
              </td>
              {editavel && (
                <td className="px-2 print:hidden">
                  <button
                    type="button"
                    onClick={() => onChange(linhas.filter((_, j) => j !== i))}
                    className="text-xs text-red-600 hover:underline"
                  >
                    ×
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {editavel && (
        <button
          type="button"
          onClick={() =>
            onChange([...linhas, { vtr: '', numeroBaon: '', codigo: '', descricao: '' }])
          }
          className="mt-1 text-xs text-cbmes-blue hover:underline print:hidden"
        >
          + ocorrência
        </button>
      )}
    </div>
  );
}

/**
 * Autocomplete BAON — digita query, faz `api.incidentesBaonSearch` e mostra
 * dropdown. Ao selecionar, propaga código + descrição.
 */
function BaonAutocomplete({
  valorCodigo,
  valorDescricao,
  onSelect,
}: {
  valorCodigo: string;
  valorDescricao: string;
  onSelect: (codigo: string, descricao: string) => void;
}) {
  const [query, setQuery] = useState(
    valorCodigo ? (valorDescricao ? `${valorCodigo} — ${valorDescricao}` : valorCodigo) : '',
  );
  const [hits, setHits] = useState<IncidenteBaon[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!query || query.length < 1) {
      setHits([]);
      return;
    }
    const t = setTimeout(() => {
      api
        .incidentesBaonSearch(query, 15)
        .then(setHits)
        .catch(() => setHits([]));
    }, 200);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <div className="relative">
      <input
        value={query}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        placeholder="Digite código ou descrição"
        className="w-full rounded border border-slate-200 px-1 text-xs"
      />
      {open && hits.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-20 max-h-48 overflow-auto rounded border border-slate-300 bg-white text-xs shadow-lg">
          {hits.map((h) => (
            <li
              key={h.codigo}
              onClick={() => {
                onSelect(h.codigo, h.descricao);
                setQuery(`${h.codigo} — ${h.descricao}`);
                setOpen(false);
              }}
              className="cursor-pointer px-2 py-1 hover:bg-slate-100"
            >
              <strong>{h.codigo}</strong>
              <span className="ml-1 text-slate-700">— {h.descricao}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FiscaisRodape({ pd }: { pd: ParteDiaria }) {
  return (
    <div className="mt-6 grid grid-cols-2 gap-8 text-center text-xs">
      <div>
        <p className="border-t border-slate-400 pt-1 font-medium">Fiscal que passa o serviço</p>
        <p className="mt-1">{formatRef(pd.fiscalQueAssume)}</p>
      </div>
      <div>
        <p className="border-t border-slate-400 pt-1 font-medium">Fiscal que assume o serviço</p>
        <p className="mt-1">{formatRef(pd.fiscalSubstituto)}</p>
      </div>
    </div>
  );
}

function formatRef(m: ParteDiariaMilitarRef | null): string {
  if (!m) return '_____________________';
  return `${m.posto} ${m.nome}`.replace(/\s+/g, ' ').trim();
}

function formatBr(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

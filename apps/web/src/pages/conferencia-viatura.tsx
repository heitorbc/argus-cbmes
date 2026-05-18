import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  CATEGORIA_CHECKLIST_COV_LABEL,
  CATEGORIAS_CHECKLIST_COV,
  CHECKLIST_COV_TEMPLATE,
  STATUS_VIATURA,
  STATUS_VIATURA_LABEL,
  formatDisplayName,
  type CategoriaChecklistCov,
  type ChecklistCovItem,
  type Militar,
  type StatusViatura,
  type Viatura,
} from '@argus/shared-types';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { STATUS_VIATURA_BADGE } from '@/lib/status-viatura-style';

/**
 * S2.10.6 — Conferência do COV/Motorista (viatura).
 *
 * Mudanças vs S6b/S8:
 * 1. Renomeada (era "Conferência da Viatura").
 * 2. Materiais REMOVIDOS — agora em página dedicada `/conferencia-materiais`.
 * 3. Termo de Responsabilidade adicionado antes do checklist (modal com
 *    placeholders auto-preenchidos do EFETIVO + Viatura).
 * 4. Checklist de 25 itens em 4 seções (Inspeção externa, Motor, Cabine,
 *    Equipamentos de emergência).
 * 5. Operação tradicional (KM, tanque, status) continua igual.
 */
export function ConferenciaViaturaPage() {
  const { data, vtrPrefixo } = useParams<{ data: string; vtrPrefixo: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.papeis.includes('admin') ?? false;
  const decodedPrefixo = vtrPrefixo ? decodeURIComponent(vtrPrefixo) : '';

  const [viatura, setViatura] = useState<Viatura | null>(null);
  const [motoristaMilitar, setMotoristaMilitar] = useState<Militar | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [kmAtual, setKmAtual] = useState<string>('');
  const [estadoTanque, setEstadoTanque] = useState<number>(50);
  const [observacao, setObservacao] = useState<string>('');
  const [mudarStatus, setMudarStatus] = useState(false);
  const [statusMudanca, setStatusMudanca] = useState<StatusViatura>('DISPONIVEL');
  const [motivoBaixa, setMotivoBaixa] = useState<string>('');

  // S2.10.6 — Termo + Checklist
  const [termoAceito, setTermoAceito] = useState(false);
  const [termoAceitoEm, setTermoAceitoEm] = useState<string | null>(null);
  const [showTermoModal, setShowTermoModal] = useState(false);
  const [checklistItens, setChecklistItens] = useState<ChecklistCovItem[]>(() =>
    CHECKLIST_COV_TEMPLATE.map((t) => ({ ...t, ok: false })),
  );

  useEffect(() => {
    if (!vtrPrefixo) return;
    let cancelled = false;
    setLoading(true);
    api
      .viaturasList()
      .then((all) => {
        if (cancelled) return;
        const v = all.find((x) => x.prefixo === decodedPrefixo);
        if (!v) {
          setError(`Viatura ${decodedPrefixo} não encontrada`);
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
  }, [vtrPrefixo, decodedPrefixo]);

  // Auto-fill do motorista logado (EFETIVO) para o termo.
  useEffect(() => {
    if (!user?.nf) return;
    let cancelled = false;
    api
      .efetivoFindByNf(user.nf)
      .then((m) => {
        if (!cancelled) setMotoristaMilitar(m);
      })
      .catch(() => {
        // Se Efetivo não retornar (cache stale), o termo ainda funciona sem auto-fill.
      });
    return () => {
      cancelled = true;
    };
  }, [user?.nf]);

  // Carrega conferência COV existente do dia/viatura (admin pode editar).
  useEffect(() => {
    if (!data || !decodedPrefixo) return;
    let cancelled = false;
    api
      .conferenciaCovGet(data, decodedPrefixo)
      .then((existing) => {
        if (cancelled || !existing) return;
        setTermoAceito(true);
        setTermoAceitoEm(existing.termoAceitoEm);
        setChecklistItens(existing.itens);
        if (existing.observacao) setObservacao(existing.observacao);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [data, decodedPrefixo]);

  const ultimoKm = (viatura?.historicoKm ?? []).reduce(
    (acc, h) => Math.max(acc, h.kmRegistrado),
    viatura?.kmAtual ?? 0,
  );
  const novoKmNum = kmAtual.trim() ? Number(kmAtual) : undefined;
  const isDecremento = novoKmNum !== undefined && novoKmNum < ultimoKm;
  const decrementoBloqueado = isDecremento && !isAdmin;
  const decrementoExigeObservacao = isDecremento && isAdmin;
  const observacaoFaltando = decrementoExigeObservacao && !observacao.trim();

  const itensPorCategoria = useMemo(() => {
    const groups: Record<CategoriaChecklistCov, ChecklistCovItem[]> = {
      inspecao_externa: [],
      compartimento_motor: [],
      cabine: [],
      equipamentos_emergencia: [],
    };
    for (const item of checklistItens) groups[item.categoria].push(item);
    return groups;
  }, [checklistItens]);

  const totalItens = checklistItens.length;
  const itensOk = checklistItens.filter((i) => i.ok).length;
  const todosOk = itensOk === totalItens;
  const itensNokSemObs = checklistItens.filter((i) => !i.ok && !i.observacao?.trim()).length;

  const toggleItem = (idx: number, patch: Partial<ChecklistCovItem>) => {
    setChecklistItens((arr) => arr.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };

  const handleAceitarTermo = () => {
    setTermoAceito(true);
    setTermoAceitoEm(new Date().toISOString());
    setShowTermoModal(false);
  };

  const handleSalvarChecklist = async () => {
    if (!data || !decodedPrefixo || !termoAceitoEm) return;
    if (itensNokSemObs > 0) {
      setError(`${itensNokSemObs} item(s) marcado(s) como ✗ precisam de observação.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.conferenciaCovRegistrar(data, decodedPrefixo, {
        termoAceitoEm,
        itens: checklistItens,
        observacao: observacao.trim() || undefined,
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erro ao salvar conferência do COV');
      setSaving(false);
      return;
    }
    setSaving(false);
  };

  const handleSalvarOperacional = async () => {
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
      await api.conferenciaViaturaRegistrar(data, decodedPrefixo, {
        vtrPrefixo: decodedPrefixo,
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
        <h1 className="mt-1 text-lg font-bold">Conferência do COV/Motorista (viatura)</h1>
        <p className="text-xs opacity-90">
          {decodedPrefixo} · {data}
        </p>
      </header>

      <section className="mx-auto max-w-2xl space-y-4 p-4">
        {loading && <p className="text-sm text-slate-500">Carregando…</p>}
        {error && (
          <div
            role="alert"
            className="rounded border border-feedback-error/30 bg-feedback-error/10 p-3 text-sm text-feedback-error"
          >
            {error}
          </div>
        )}

        {viatura && !termoAceito && (
          <div className="rounded border border-cbmes-blue/40 bg-cbmes-blue/5 p-4 text-sm">
            <p className="font-semibold text-cbmes-blue">⚠ Aceite do Termo de Responsabilidade</p>
            <p className="mt-1 text-slate-600">
              Antes de iniciar o checklist da viatura, o COV/Motorista precisa aceitar o termo
              institucional.
            </p>
            <button
              type="button"
              onClick={() => setShowTermoModal(true)}
              className="mt-3 w-full rounded-button bg-cbmes-blue py-2 text-sm font-semibold text-white"
            >
              Abrir Termo de Responsabilidade
            </button>
          </div>
        )}

        {viatura && termoAceito && (
          <>
            <ChecklistCov
              itensPorCategoria={itensPorCategoria}
              totalItens={totalItens}
              itensOk={itensOk}
              todosOk={todosOk}
              onToggle={toggleItem}
            />

            <div className="rounded border border-cbmes-blue/30 bg-white p-4 text-xs">
              <p className="font-medium text-slate-700">
                Termo aceito em{' '}
                {termoAceitoEm ? new Date(termoAceitoEm).toLocaleString('pt-BR') : '—'} por NF{' '}
                {user?.nf ?? '—'}.
              </p>
              <button
                type="button"
                onClick={handleSalvarChecklist}
                disabled={saving || !todosOk || itensNokSemObs > 0}
                className="mt-2 w-full rounded-button bg-cbmes-blue py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {saving ? 'Salvando…' : 'Salvar checklist do COV'}
              </button>
              {itensNokSemObs > 0 && (
                <p className="mt-1 text-feedback-error">
                  {itensNokSemObs} item(s) marcado(s) como ✗ precisam de observação.
                </p>
              )}
            </div>
          </>
        )}

        {/* Bloco operacional (KM, tanque, status) — mantido de S6b */}
        {viatura && (
          <div className="space-y-4 rounded border border-cbmes-red/30 bg-white p-4">
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
                  ⚠ Decremento detectado. Como admin, informe observação obrigatória abaixo.
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
                    ? 'Justifique o decremento de KM'
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

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={handleSalvarOperacional}
                disabled={saving || decrementoBloqueado || observacaoFaltando}
                className="flex-1 rounded-button bg-cbmes-red py-2 text-base font-semibold text-white disabled:opacity-60"
              >
                {saving ? 'Salvando…' : 'Salvar e voltar à Prévia'}
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

      {showTermoModal && viatura && (
        <TermoModal
          motorista={
            motoristaMilitar ??
            ({
              nf: user?.nf ?? '',
              nome: user?.nome ?? '',
              nomeGuerra: user?.nomeGuerra,
              posto: user?.posto ?? '',
              ant: user?.ant ?? 0,
            } as Militar)
          }
          viatura={viatura}
          dataServico={data}
          onAceitar={handleAceitarTermo}
          onCancelar={() => setShowTermoModal(false)}
        />
      )}
    </main>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Checklist (4 categorias)
// ────────────────────────────────────────────────────────────────────────

function ChecklistCov({
  itensPorCategoria,
  totalItens,
  itensOk,
  todosOk,
  onToggle,
}: {
  itensPorCategoria: Record<CategoriaChecklistCov, ChecklistCovItem[]>;
  totalItens: number;
  itensOk: number;
  todosOk: boolean;
  onToggle: (idxGlobal: number, patch: Partial<ChecklistCovItem>) => void;
}) {
  let indexCursor = 0;
  return (
    <div className="space-y-3 rounded border border-cbmes-blue/30 bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-cbmes-blue">Checklist do COV (25 itens)</h2>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-bold ${
            todosOk ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
          }`}
        >
          {itensOk}/{totalItens} ✓
        </span>
      </div>

      {CATEGORIAS_CHECKLIST_COV.map((cat) => {
        const itens = itensPorCategoria[cat];
        const inicio = indexCursor;
        indexCursor += itens.length;
        return (
          <details key={cat} open className="rounded border border-slate-200 bg-slate-50">
            <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-slate-700">
              {CATEGORIA_CHECKLIST_COV_LABEL[cat]} ({itens.filter((i) => i.ok).length}/
              {itens.length})
            </summary>
            <ul className="space-y-1 px-3 py-2">
              {itens.map((item, i) => {
                const globalIdx = inicio + i;
                return (
                  <li
                    key={`${cat}-${i}`}
                    className="flex flex-wrap items-start gap-2 rounded border border-slate-200 bg-white p-2"
                  >
                    <label className="flex flex-1 items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={item.ok}
                        onChange={(e) => onToggle(globalIdx, { ok: e.target.checked })}
                        className="mt-0.5 h-4 w-4"
                      />
                      <span className="text-sm text-slate-700">{item.descricao}</span>
                    </label>
                    {!item.ok && (
                      <input
                        type="text"
                        value={item.observacao ?? ''}
                        onChange={(e) =>
                          onToggle(globalIdx, { observacao: e.target.value || undefined })
                        }
                        placeholder="Observação obrigatória"
                        className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          </details>
        );
      })}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Termo de Responsabilidade (modal)
// ────────────────────────────────────────────────────────────────────────

function TermoModal({
  motorista,
  viatura,
  dataServico,
  onAceitar,
  onCancelar,
}: {
  motorista: Militar;
  viatura: Viatura;
  dataServico: string;
  onAceitar: () => void;
  onCancelar: () => void;
}) {
  const nomeCompleto = motorista.nome ?? '';
  const postoGrad = motorista.posto ?? '';
  const matricula = motorista.nf ?? '';
  const lotacao = motorista.lotacao ?? motorista.unidade ?? '1ª Cia / 1º BBM';
  const cnh = motorista.cnh ?? '—';
  const categoriaCnh = ''; // QDI atual não tem essa categorização granular; admin pode estender
  const cnhValidade = motorista.cnhValidade ?? '—';
  const prefixo = viatura.prefixo;
  const placa = viatura.placa ?? '—';
  const modelo = viatura.tipo ?? '—';
  const formatDataHora = `${dataServico} às ${String(new Date().getHours()).padStart(2, '0')}h`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onCancelar}
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 p-3"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded border border-cbmes-blue bg-white p-5 shadow-xl"
      >
        <h2 className="text-lg font-bold text-cbmes-blue">
          Termo de Responsabilidade — Condutor Operador de Viatura
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Auto-preenchido com dados do EFETIVO/QDI e da viatura. Leia atentamente.
        </p>

        <div className="mt-3 space-y-2 text-xs leading-relaxed text-slate-700">
          <p>
            Eu, <strong>{nomeCompleto || '___________________________'}</strong>, posto/graduação{' '}
            <strong>{postoGrad || '__________'}</strong>, matrícula nº{' '}
            <strong>{matricula || '_________'}</strong>, lotado(a) no(a) <strong>{lotacao}</strong>,
            portador(a) da CNH nº <strong>{cnh}</strong>
            {categoriaCnh ? `, categoria ${categoriaCnh}` : ''}, válida até{' '}
            <strong>{cnhValidade}</strong>, ao assumir a condução da viatura prefixo{' '}
            <strong>{prefixo}</strong>, placa <strong>{placa}</strong>, modelo{' '}
            <strong>{modelo}</strong>, no serviço iniciado em <strong>{formatDataHora}</strong>,
            declaro estar ciente e assumo integralmente as seguintes responsabilidades:
          </p>
          <ol className="ml-5 list-decimal space-y-1.5">
            <li>
              Encontro-me em plenas condições físicas e psicológicas para conduzir o veículo, não
              estando sob efeito de álcool, medicamentos que comprometam os reflexos ou qualquer
              outra substância que afete minha capacidade de direção.
            </li>
            <li>
              Realizei a inspeção prévia da viatura conforme checklist anexo, atestando suas
              condições de segurança, funcionamento e abastecimento operacional.
            </li>
            <li>
              Comprometo-me a observar rigorosamente o Código de Trânsito Brasileiro (Lei nº
              9.503/97), as normas internas do CBMES — em especial a Portaria nº 330-R/2014 e a
              Portaria nº 135-R/2008 — bem como as orientações do Chefe de Socorro/Comandante da
              guarnição.
            </li>
            <li>
              Utilizarei os dispositivos de prioridade de passagem (sinais luminosos e sonoros)
              somente em situações de efetiva emergência, conduzindo com a prudência exigida pelo
              art. 29, §§ 2º e 3º, do CTB.
            </li>
            <li>
              Responsabilizo-me pela guarda, conservação e correta operação da viatura e de seus
              equipamentos embarcados durante o período sob minha responsabilidade, comunicando
              imediatamente ao superior qualquer avaria, sinistro, infração de trânsito ou
              ocorrência anormal.
            </li>
            <li>
              Estou ciente de que o descumprimento dos deveres aqui assumidos poderá ensejar
              responsabilização administrativa, civil e penal, nos termos da legislação vigente.
            </li>
          </ol>
        </div>

        <div className="mt-4 rounded bg-amber-50 p-3 text-xs text-amber-800">
          Ao clicar em <strong>CIENTE</strong>, este aceite será registrado com seu NF (
          {motorista.nf || '—'}) e o timestamp do servidor.{' '}
          <strong>
            {formatDisplayName({
              posto: postoGrad,
              nome: nomeCompleto,
              nomeGuerra: motorista.nomeGuerra,
            })}
          </strong>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onAceitar}
            className="flex-1 rounded-button bg-cbmes-blue py-3 text-sm font-bold text-white hover:bg-cbmes-blue/90"
          >
            CIENTE
          </button>
          <button
            type="button"
            onClick={onCancelar}
            className="rounded-button border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

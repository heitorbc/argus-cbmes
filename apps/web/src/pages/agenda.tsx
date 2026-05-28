import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { AgendaItem, AgendaResponse, AgendaFonte } from '@argus/shared-types';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { FonteBadge, FONTE_CFG } from '@/components/AgendaCard';
import { SkeletonLines } from '@/components/Skeleton';

type Visao = 'lista' | 'calendario';

/**
 * S2.10.13c — Fontes na ordem de prioridade da agenda. ChOp pode ser
 * filtrada para baixo da lista (é a única condicional).
 */
const TODAS_FONTES: AgendaFonte[] = [
  'escala_mensal',
  'escala_especial',
  'iseo_hospitais',
  'troca_autorizada',
  'nota_servico',
  'atestado',
  'dispensa',
  'ferias',
  'chefe_operacoes',
];

/**
 * S2.10.13c — Fontes que ficam ATIVAS por default na 1ª visita do user.
 * As demais aparecem como toggles desativados; user marca o que quer ver.
 * Decisão Tech Lead: reduzir saturação visual mostrando só o core operacional.
 */
const FONTES_DEFAULT: AgendaFonte[] = [
  'escala_mensal',
  'escala_especial',
  'iseo_hospitais',
  'troca_autorizada',
];

const FONTES_STORAGE_KEY = 'argus.agenda.fontesAtivas';

function loadFontesFromStorage(): Set<AgendaFonte> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(FONTES_STORAGE_KEY);
    if (!raw) return null;
    const arr = JSON.parse(raw) as string[];
    if (!Array.isArray(arr)) return null;
    const valid = arr.filter((s): s is AgendaFonte => TODAS_FONTES.includes(s as AgendaFonte));
    return new Set(valid);
  } catch {
    return null;
  }
}

/**
 * Página /agenda — visão completa do militar logado.
 * Toggle entre lista cronológica e grade de calendário mensal.
 * Filtros: range (30/60/90 dias) + fontes ativas. Conflitos destacados.
 */
export function AgendaPage() {
  const { user } = useAuth();
  const [visao, setVisao] = useState<Visao>('lista');
  const [dias, setDias] = useState<number>(30);
  const [incluirPassado, setIncluirPassado] = useState(false);

  // S2.10.13c — Default: 4 fontes core (Mensal/Especial/ISEO/Trocas).
  // Demais ficam desativas no 1º acesso; user marca o que quer ver.
  // Persistência localStorage `argus.agenda.fontesAtivas`.
  const [fontesAtivas, setFontesAtivas] = useState<Set<AgendaFonte>>(() => {
    return loadFontesFromStorage() ?? new Set(FONTES_DEFAULT);
  });

  // Persiste a escolha de filtros entre sessões.
  useEffect(() => {
    try {
      window.localStorage.setItem(FONTES_STORAGE_KEY, JSON.stringify([...fontesAtivas]));
    } catch {
      /* ignore */
    }
  }, [fontesAtivas]);

  // S2.10.13c — Verifica se o user logado é ChOp habilitado. ChOp como
  // filtro só aparece para militares habilitados (planilha externa).
  const { data: habilitados } = useQuery({
    queryKey: ['chop-habilitados-me', user?.nf ?? ''],
    queryFn: () => api.chefesOperacoesHabilitados(),
    enabled: !!user?.nf,
    staleTime: 24 * 60 * 60 * 1000, // 24h — NF de ChOp habilitado muda raramente
    retry: false,
  });
  const isChopHabilitado = useMemo(() => {
    if (!user?.nf || !habilitados) return false;
    return habilitados.some((h) => h.nf === user.nf);
  }, [habilitados, user?.nf]);

  // Lista de fontes visíveis como toggle: omite ChOp se não-habilitado.
  const fontesVisiveis = useMemo<AgendaFonte[]>(() => {
    return TODAS_FONTES.filter((f) => f !== 'chefe_operacoes' || isChopHabilitado);
  }, [isChopHabilitado]);

  // S2.10.9c — useQuery substitui useEffect+fetch. staleTime 5min reduz refetches em navegações.
  const {
    data,
    isLoading: loading,
    error: queryError,
  } = useQuery<AgendaResponse>({
    queryKey: ['agenda', dias, incluirPassado],
    queryFn: () => {
      if (incluirPassado) {
        const hoje = new Date();
        const inicio = new Date(hoje);
        inicio.setUTCDate(inicio.getUTCDate() - 30);
        const fim = new Date(hoje);
        fim.setUTCDate(fim.getUTCDate() + dias);
        return api.agendaRange(inicio.toISOString().slice(0, 10), fim.toISOString().slice(0, 10));
      }
      return api.agendaProxima(dias);
    },
    staleTime: 5 * 60 * 1000,
  });
  const error = queryError
    ? queryError instanceof ApiError
      ? queryError.message
      : 'Erro ao carregar agenda'
    : null;

  const itensFiltrados = useMemo(() => {
    if (!data) return [];
    return data.itens.filter((i) => {
      if (!fontesAtivas.has(i.fonte)) return false;
      // S2.10.13c — esconde entries de ChOp para usuários não habilitados
      // (não basta filtrar o toggle: backend retorna entries baseado no NF).
      if (i.fonte === 'chefe_operacoes' && !isChopHabilitado) return false;
      return true;
    });
  }, [data, fontesAtivas, isChopHabilitado]);

  const datasComConflito = useMemo(() => {
    if (!data) return new Set<string>();
    return new Set(data.conflitos.map((c) => c.data));
  }, [data]);

  const toggleFonte = (f: AgendaFonte) => {
    setFontesAtivas((prev) => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return next;
    });
  };

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-cbmes-blue px-4 py-4 text-white">
        <Link to="/" className="text-sm opacity-90 hover:opacity-100">
          ← Home
        </Link>
        <h1 className="mt-1 text-lg font-bold">📅 Minha Agenda</h1>
        <p className="text-xs opacity-90">
          Próximas escalas de todas as fontes · conflitos destacados
        </p>
      </header>

      <section className="mx-auto max-w-5xl p-4">
        {error && (
          <div className="mb-3 rounded border border-feedback-error/30 bg-feedback-error/10 p-3 text-sm text-feedback-error">
            {error}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 rounded border border-slate-200 bg-white p-3">
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setVisao('lista')}
              className={`rounded-button px-3 py-1.5 text-xs font-medium ${
                visao === 'lista'
                  ? 'bg-cbmes-blue text-white'
                  : 'border border-slate-300 bg-white text-slate-700'
              }`}
            >
              📋 Lista
            </button>
            <button
              type="button"
              onClick={() => setVisao('calendario')}
              className={`rounded-button px-3 py-1.5 text-xs font-medium ${
                visao === 'calendario'
                  ? 'bg-cbmes-blue text-white'
                  : 'border border-slate-300 bg-white text-slate-700'
              }`}
            >
              🗓️ Calendário
            </button>
          </div>

          <div className="ml-auto flex items-center gap-2 text-xs">
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={incluirPassado}
                onChange={(e) => setIncluirPassado(e.target.checked)}
                className="h-4 w-4"
              />
              <span className="text-slate-700">Incluir passado (30d)</span>
            </label>
            <span className="text-slate-500">Range:</span>
            {[30, 60, 90].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setDias(n)}
                className={`rounded px-2 py-1 ${
                  dias === n ? 'bg-cbmes-blue text-white' : 'border border-slate-300 text-slate-700'
                }`}
              >
                {n}d
              </button>
            ))}
          </div>
        </div>

        <div className="mt-2 flex flex-wrap gap-2 rounded border border-slate-200 bg-white p-3 text-xs">
          <span className="text-slate-500">Filtrar fontes:</span>
          {fontesVisiveis.map((f) => {
            const cfg = FONTE_CFG[f];
            const ativo = fontesAtivas.has(f);
            return (
              <button
                key={f}
                type="button"
                onClick={() => toggleFonte(f)}
                className={`rounded px-2 py-1 ${
                  ativo ? cfg.classes : 'border border-slate-200 text-slate-400'
                }`}
              >
                {cfg.label}
              </button>
            );
          })}
        </div>

        {loading ? (
          <SkeletonLines lines={6} className="mt-4" />
        ) : visao === 'lista' ? (
          <ListaView itens={itensFiltrados} datasConflito={datasComConflito} />
        ) : (
          <CalendarioView itens={itensFiltrados} datasConflito={datasComConflito} dias={dias} />
        )}
      </section>
    </main>
  );
}

function ListaView({ itens, datasConflito }: { itens: AgendaItem[]; datasConflito: Set<string> }) {
  if (itens.length === 0) {
    return <p className="mt-4 text-sm italic text-slate-500">Nenhuma escala encontrada.</p>;
  }
  // Agrupar por data
  const porData = new Map<string, AgendaItem[]>();
  for (const i of itens) {
    const arr = porData.get(i.data);
    if (arr) arr.push(i);
    else porData.set(i.data, [i]);
  }
  return (
    <ul className="mt-3 space-y-3">
      {[...porData.entries()].map(([data, lista]) => (
        <li
          key={data}
          className={`rounded border p-3 text-sm ${
            datasConflito.has(data)
              ? 'border-feedback-error/40 bg-feedback-error/5'
              : 'border-slate-200 bg-white'
          }`}
        >
          <div className="mb-1 flex items-baseline gap-2">
            <strong className="text-slate-900">{formatDataLonga(data)}</strong>
            {datasConflito.has(data) && (
              <span className="rounded bg-feedback-error/15 px-2 py-0.5 text-[10px] font-bold uppercase text-feedback-error">
                ⚠ conflito
              </span>
            )}
          </div>
          <ul className="space-y-1">
            {lista.map((i, idx) => (
              <li key={i.id ?? `${i.fonte}-${idx}`} className="flex items-start gap-2">
                <FonteBadge fonte={i.fonte} />
                <span className="flex-1">
                  <span className="text-slate-800">{i.titulo}</span>
                  {i.subtitulo && (
                    <span className="ml-2 text-xs text-slate-500">{i.subtitulo}</span>
                  )}
                  {i.horarioInicio && (
                    <span className="ml-2 text-xs text-slate-600">
                      {i.horarioInicio}
                      {i.horarioFim ? `–${i.horarioFim}` : ''}
                    </span>
                  )}
                </span>
                {i.detalheUrl && (
                  <Link to={i.detalheUrl} className="text-xs text-cbmes-blue hover:underline">
                    detalhe →
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

function CalendarioView({
  itens,
  datasConflito,
  dias,
}: {
  itens: AgendaItem[];
  datasConflito: Set<string>;
  dias: number;
}) {
  // Gera dias do calendário cobrindo o range (mês atual + necessários)
  const hoje = new Date();
  const fim = new Date(hoje);
  fim.setUTCDate(fim.getUTCDate() + dias);
  // Início: domingo da semana de hoje
  const inicio = new Date(hoje);
  inicio.setUTCDate(inicio.getUTCDate() - inicio.getUTCDay());

  const todasDatas: string[] = [];
  for (let d = new Date(inicio); d <= fim; d.setUTCDate(d.getUTCDate() + 1)) {
    todasDatas.push(d.toISOString().slice(0, 10));
  }
  // Arredondar para múltiplo de 7
  while (todasDatas.length % 7 !== 0) {
    const ultimo = new Date(`${todasDatas[todasDatas.length - 1]!}T00:00:00Z`);
    ultimo.setUTCDate(ultimo.getUTCDate() + 1);
    todasDatas.push(ultimo.toISOString().slice(0, 10));
  }

  const itensPorData = new Map<string, AgendaItem[]>();
  for (const i of itens) {
    const arr = itensPorData.get(i.data);
    if (arr) arr.push(i);
    else itensPorData.set(i.data, [i]);
  }

  const hojeIso = hoje.toISOString().slice(0, 10);

  return (
    <div className="mt-3">
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase text-slate-500">
        {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {todasDatas.map((data) => {
          const lista = itensPorData.get(data) ?? [];
          const conflito = datasConflito.has(data);
          const isHoje = data === hojeIso;
          const dia = Number.parseInt(data.slice(8, 10), 10);
          return (
            <div
              key={data}
              className={`min-h-[64px] rounded border p-1 text-left text-[10px] ${
                conflito
                  ? 'border-feedback-error/60 bg-feedback-error/10'
                  : isHoje
                    ? 'border-cbmes-blue bg-cbmes-blue/5'
                    : lista.length > 0
                      ? 'border-slate-200 bg-white'
                      : 'border-slate-100 bg-slate-50/50'
              }`}
            >
              <div className="flex items-center gap-1">
                <span className={`font-semibold ${isHoje ? 'text-cbmes-blue' : 'text-slate-700'}`}>
                  {dia}
                </span>
                {conflito && <span className="text-feedback-error">⚠</span>}
              </div>
              <div className="mt-0.5 flex flex-wrap gap-0.5">
                {lista.map((i, idx) => (
                  <span
                    key={i.id ?? idx}
                    className={`inline-block h-2 w-2 rounded-full ${dotColor(i.fonte)}`}
                    title={`${FONTE_CFG[i.fonte].label}: ${i.titulo}`}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-3 rounded border border-slate-200 bg-white p-2 text-[10px] text-slate-600">
        {TODAS_FONTES.map((f) => (
          <span key={f} className="flex items-center gap-1">
            <span className={`inline-block h-2 w-2 rounded-full ${dotColor(f)}`} />
            {FONTE_CFG[f].label}
          </span>
        ))}
      </div>
    </div>
  );
}

function dotColor(fonte: AgendaFonte): string {
  switch (fonte) {
    case 'escala_mensal':
      return 'bg-cbmes-blue';
    case 'escala_especial':
      return 'bg-purple-500';
    case 'nota_servico':
      return 'bg-green-500';
    case 'iseo_hospitais':
      return 'bg-amber-500';
    case 'chefe_operacoes':
      return 'bg-rose-500';
    case 'atestado':
      return 'bg-slate-400';
    case 'dispensa':
      return 'bg-slate-500';
    case 'ferias':
      return 'bg-sky-500';
    case 'troca_autorizada':
      return 'bg-orange-500';
  }
}

function formatDataLonga(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  const dias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const d = new Date(`${iso}T12:00:00Z`);
  return `${dias[d.getUTCDay()]} · ${m[3]}/${m[2]}/${m[1]}`;
}

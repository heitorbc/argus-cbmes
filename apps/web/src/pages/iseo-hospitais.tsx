import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { IseoHospitalEntry } from '@argus/shared-types';
import { ApiError, api } from '@/lib/api';

type Unidade = 'HPM' | 'HIMABA';
type Visao = 'lista' | 'calendario';

/**
 * Presets de período aceitos no filtro. A ordem importa — define a ordem
 * dos botões no dropdown.
 */
type PeriodoPreset =
  | 'hoje'
  | 'proximos7'
  | 'passados7'
  | 'mesAtual'
  | 'mesAnterior'
  | 'todas'
  | 'custom';

const PERIODO_LABEL: Record<PeriodoPreset, string> = {
  hoje: 'Hoje',
  proximos7: 'Próximos 7 dias',
  passados7: '7 dias passados',
  mesAtual: 'Mês atual',
  mesAnterior: 'Mês anterior',
  todas: 'Todas as datas',
  custom: 'Período personalizado',
};

const POSTO_ORDER = [
  'CEL', 'TC', 'MAJ', 'CAP', '1ºTEN', '2ºTEN', 'ASP',
  'SUBTEN', '1ºSGT', '2ºSGT', '3ºSGT', 'CB', 'SD',
];
function postoIdx(p: string): number {
  const i = POSTO_ORDER.findIndex((x) => p.toUpperCase().startsWith(x));
  return i < 0 ? 99 : i;
}

/**
 * S2.8.1 — calcula `[inicio, fim]` (datas ISO inclusive) para um preset.
 * Retorna `null` para "todas" (sem filtro). Para "custom", caller usa
 * `customInicio`/`customFim` direto.
 */
function rangeFromPreset(
  preset: PeriodoPreset,
  customInicio: string,
  customFim: string,
): { inicio: string; fim: string } | null {
  if (preset === 'todas') return null;
  if (preset === 'custom') {
    if (!customInicio || !customFim) return null;
    return { inicio: customInicio, fim: customFim };
  }
  const hoje = new Date();
  const isoHoje = hoje.toISOString().slice(0, 10);
  switch (preset) {
    case 'hoje':
      return { inicio: isoHoje, fim: isoHoje };
    case 'proximos7': {
      const fim = new Date(hoje);
      fim.setUTCDate(fim.getUTCDate() + 7);
      return { inicio: isoHoje, fim: fim.toISOString().slice(0, 10) };
    }
    case 'passados7': {
      const inicio = new Date(hoje);
      inicio.setUTCDate(inicio.getUTCDate() - 7);
      return { inicio: inicio.toISOString().slice(0, 10), fim: isoHoje };
    }
    case 'mesAtual': {
      const ano = hoje.getUTCFullYear();
      const mes = hoje.getUTCMonth();
      const ini = new Date(Date.UTC(ano, mes, 1));
      const fim = new Date(Date.UTC(ano, mes + 1, 0));
      return {
        inicio: ini.toISOString().slice(0, 10),
        fim: fim.toISOString().slice(0, 10),
      };
    }
    case 'mesAnterior': {
      const ano = hoje.getUTCFullYear();
      const mes = hoje.getUTCMonth();
      const ini = new Date(Date.UTC(ano, mes - 1, 1));
      const fim = new Date(Date.UTC(ano, mes, 0));
      return {
        inicio: ini.toISOString().slice(0, 10),
        fim: fim.toISOString().slice(0, 10),
      };
    }
  }
}

/**
 * Página Sargenteação: escala ISEO Hospitais (HPM + HIMABA).
 * Read-only. A fonte é a planilha pública via CSV; cache 5min no backend.
 * As entradas alimentam a Agenda do militar (módulo Agenda).
 *
 * S2.8.1 — ganhou:
 *   - Visão calendário (toggle Lista ↔ Calendário).
 *   - Filtro de período por preset (hoje / próximos 7d / 7d passados /
 *     mês atual / mês anterior / personalizado / todas).
 */
export function IseoHospitaisPage() {
  const [todas, setTodas] = useState<IseoHospitalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Unidade>('HPM');
  const [filtroMilitar, setFiltroMilitar] = useState<string>('');
  const [visao, setVisao] = useState<Visao>('lista');
  const [periodo, setPeriodo] = useState<PeriodoPreset>('hoje');
  const [customInicio, setCustomInicio] = useState<string>('');
  const [customFim, setCustomFim] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .iseoHospitaisList()
      .then((list) => {
        if (cancelled) return;
        setTodas(list);
        setError(null);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof ApiError ? e.message : 'Erro ao carregar escala ISEO Hospitais');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const range = useMemo(
    () => rangeFromPreset(periodo, customInicio, customFim),
    [periodo, customInicio, customFim],
  );

  const filtradas = useMemo(() => {
    return todas
      .filter((e) => e.unidade === tab)
      .filter((e) => {
        if (range && (e.dataIso < range.inicio || e.dataIso > range.fim)) return false;
        if (filtroMilitar) {
          const n = filtroMilitar.toUpperCase();
          if (!e.nome.toUpperCase().includes(n) && !e.nf.includes(n)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (a.dataIso !== b.dataIso) return a.dataIso.localeCompare(b.dataIso);
        if (a.turno !== b.turno) return a.turno === 'Diurno' ? -1 : 1;
        const pi = postoIdx(a.posto) - postoIdx(b.posto);
        if (pi !== 0) return pi;
        return a.nome.localeCompare(b.nome);
      });
  }, [todas, tab, range, filtroMilitar]);

  const countsByUnidade = useMemo(() => {
    return {
      HPM: todas.filter((e) => e.unidade === 'HPM').length,
      HIMABA: todas.filter((e) => e.unidade === 'HIMABA').length,
    };
  }, [todas]);

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-cbmes-blue px-4 py-4 text-white">
        <Link to="/" className="text-sm opacity-90 hover:opacity-100">
          ← Home
        </Link>
        <h1 className="mt-1 text-lg font-bold">🏥 ISEO Hospitais</h1>
        <p className="text-xs opacity-90">
          Escala HPM + HIMABA · planilha externa (Google Sheets) · read-only
        </p>
      </header>

      <section className="mx-auto max-w-5xl p-4">
        <div className="rounded border border-slate-200 bg-white p-3 text-xs text-slate-600">
          <strong>Fonte:</strong> planilha institucional ISEO Hospitais (Google Sheets, sincronização
          a cada ~5min). As entradas alimentam automaticamente a <strong>Agenda do militar</strong>
          {' '}e ficam disponíveis para detecção de conflito com outras escalas (Mensal, Especial,
          Notas de Serviço).
        </div>

        {error && (
          <div className="mt-3 rounded border border-feedback-error/30 bg-feedback-error/10 p-3 text-sm text-feedback-error">
            {error}
          </div>
        )}

        {/* Tabs Unidade + Toggle Lista/Calendário */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setTab('HPM')}
            className={`rounded-button px-3 py-1.5 text-xs font-medium ${
              tab === 'HPM' ? 'bg-cbmes-blue text-white' : 'border border-slate-300 bg-white text-slate-700'
            }`}
          >
            HPM ({countsByUnidade.HPM})
          </button>
          <button
            type="button"
            onClick={() => setTab('HIMABA')}
            className={`rounded-button px-3 py-1.5 text-xs font-medium ${
              tab === 'HIMABA' ? 'bg-cbmes-blue text-white' : 'border border-slate-300 bg-white text-slate-700'
            }`}
          >
            HIMABA ({countsByUnidade.HIMABA})
          </button>

          <div className="ml-auto flex gap-1">
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
        </div>

        {/* Filtros: período + militar */}
        <div className="mt-3 grid grid-cols-1 gap-3 rounded border border-slate-200 bg-white p-3 sm:grid-cols-[1fr_1fr]">
          <label className="block">
            <span className="text-[10px] uppercase tracking-wide text-slate-500">
              Período
            </span>
            <select
              value={periodo}
              onChange={(e) => setPeriodo(e.target.value as PeriodoPreset)}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm"
            >
              {(Object.keys(PERIODO_LABEL) as PeriodoPreset[]).map((p) => (
                <option key={p} value={p}>
                  {PERIODO_LABEL[p]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-wide text-slate-500">
              Militar (nome ou NF)
            </span>
            <input
              type="text"
              value={filtroMilitar}
              onChange={(e) => setFiltroMilitar(e.target.value)}
              placeholder="Digite parte do nome ou NF"
              className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm"
            />
          </label>
          {periodo === 'custom' && (
            <>
              <label className="block">
                <span className="text-[10px] uppercase tracking-wide text-slate-500">De</span>
                <input
                  type="date"
                  value={customInicio}
                  onChange={(e) => setCustomInicio(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-[10px] uppercase tracking-wide text-slate-500">Até</span>
                <input
                  type="date"
                  value={customFim}
                  onChange={(e) => setCustomFim(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm"
                />
              </label>
            </>
          )}
        </div>

        {loading ? (
          <p className="mt-4 text-sm text-slate-500">Carregando escala…</p>
        ) : filtradas.length === 0 ? (
          <p className="mt-4 text-sm italic text-slate-500">
            Nenhuma escala encontrada para {tab} com os filtros atuais.
          </p>
        ) : visao === 'lista' ? (
          <ListaView entries={filtradas} />
        ) : (
          <CalendarioView entries={filtradas} range={range} tab={tab} />
        )}
      </section>
    </main>
  );
}

function ListaView({ entries }: { entries: IseoHospitalEntry[] }) {
  return (
    <ul className="mt-3 space-y-2">
      {entries.map((e, i) => (
        <li
          key={`${e.unidade}-${e.dataIso}-${e.turno}-${e.nf}-${i}`}
          className="rounded border border-slate-200 bg-white p-3 text-sm"
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-semibold text-slate-900">{formatDataBR(e.dataIso)}</span>
            <span
              className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                e.turno === 'Diurno'
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-indigo-100 text-indigo-800'
              }`}
            >
              {e.turno}
            </span>
            <span className="text-xs text-slate-600">{e.unidade}</span>
          </div>
          <div className="mt-1 text-slate-800">
            <strong>{e.posto}</strong> {e.nome}{' '}
            <span className="text-slate-500">· NF {e.nf}</span>
          </div>
          {(e.funcao || e.cargaHoraria) && (
            <div className="mt-0.5 text-xs text-slate-600">
              {e.funcao && <span>Função: {e.funcao}</span>}
              {e.funcao && e.cargaHoraria && <span> · </span>}
              {e.cargaHoraria && <span>Carga: {e.cargaHoraria}</span>}
            </div>
          )}
          {e.contato && (
            <div className="mt-0.5 text-xs text-slate-500">Contato: {e.contato}</div>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * Visão calendário: grid mensal 7 colunas (Dom–Sáb) com dots coloridos
 * por turno nos dias com escala. Click no dia mostra detalhe lateral.
 * Cobre apenas o(s) mês(es) presentes no range filtrado.
 */
function CalendarioView({
  entries,
  range,
  tab,
}: {
  entries: IseoHospitalEntry[];
  range: { inicio: string; fim: string } | null;
  tab: Unidade;
}) {
  const [diaSelecionado, setDiaSelecionado] = useState<string | null>(null);

  // Agrupa entries por data
  const entriesPorData = useMemo(() => {
    const map = new Map<string, IseoHospitalEntry[]>();
    for (const e of entries) {
      const arr = map.get(e.dataIso);
      if (arr) arr.push(e);
      else map.set(e.dataIso, [e]);
    }
    return map;
  }, [entries]);

  // Gera datas do calendário cobrindo o range (alinhado a início de semana).
  const datas = useMemo(() => {
    const hoje = new Date();
    let inicio: Date;
    let fim: Date;
    if (range) {
      inicio = new Date(`${range.inicio}T00:00:00Z`);
      fim = new Date(`${range.fim}T00:00:00Z`);
    } else {
      // "Todas" — usa mês corrente como default visual
      const ano = hoje.getUTCFullYear();
      const mes = hoje.getUTCMonth();
      inicio = new Date(Date.UTC(ano, mes, 1));
      fim = new Date(Date.UTC(ano, mes + 1, 0));
    }
    // Alinha início ao domingo da semana
    const ini = new Date(inicio);
    ini.setUTCDate(ini.getUTCDate() - ini.getUTCDay());
    const out: string[] = [];
    for (let d = new Date(ini); d <= fim; d.setUTCDate(d.getUTCDate() + 1)) {
      out.push(d.toISOString().slice(0, 10));
    }
    // Completa pra múltiplo de 7
    while (out.length % 7 !== 0) {
      const ultimo = new Date(`${out[out.length - 1]!}T00:00:00Z`);
      ultimo.setUTCDate(ultimo.getUTCDate() + 1);
      out.push(ultimo.toISOString().slice(0, 10));
    }
    return out;
  }, [range]);

  const hojeIso = new Date().toISOString().slice(0, 10);
  const detalheDia = diaSelecionado ? entriesPorData.get(diaSelecionado) ?? [] : [];

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
        {datas.map((data) => {
          const lista = entriesPorData.get(data) ?? [];
          const isHoje = data === hojeIso;
          const isSelecionado = data === diaSelecionado;
          const dia = Number.parseInt(data.slice(8, 10), 10);
          const corBase = lista.length === 0
            ? 'border-slate-100 bg-slate-50/50'
            : isSelecionado
              ? 'border-cbmes-red bg-cbmes-red/10'
              : isHoje
                ? 'border-cbmes-blue bg-cbmes-blue/5'
                : 'border-slate-200 bg-white';
          return (
            <button
              key={data}
              type="button"
              onClick={() => setDiaSelecionado(data)}
              className={`min-h-[56px] rounded border p-1 text-left text-[10px] transition hover:border-cbmes-blue ${corBase}`}
            >
              <div className="flex items-center gap-1">
                <span
                  className={`font-semibold ${
                    isHoje ? 'text-cbmes-blue' : 'text-slate-700'
                  }`}
                >
                  {dia}
                </span>
              </div>
              <div className="mt-0.5 flex flex-wrap gap-0.5">
                {lista.map((e, idx) => (
                  <span
                    key={`${e.turno}-${e.nf}-${idx}`}
                    className={`inline-block h-2 w-2 rounded-full ${
                      e.turno === 'Diurno' ? 'bg-amber-400' : 'bg-indigo-500'
                    }`}
                    title={`${e.turno}: ${e.posto} ${e.nome}`}
                  />
                ))}
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-3 rounded border border-slate-200 bg-white p-2 text-[10px] text-slate-600">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
          Diurno
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-indigo-500" />
          Noturno
        </span>
        <span className="ml-auto text-slate-500">
          Total de entradas no período ({tab}): {entries.length}
        </span>
      </div>

      {diaSelecionado && (
        <div className="mt-3 rounded border-2 border-cbmes-red bg-white p-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-cbmes-red">
              {formatDataLonga(diaSelecionado)}
            </h3>
            <button
              type="button"
              onClick={() => setDiaSelecionado(null)}
              className="text-xs text-slate-500 hover:text-slate-700"
            >
              ✕ Fechar
            </button>
          </div>
          {detalheDia.length === 0 ? (
            <p className="mt-2 text-xs italic text-slate-500">
              Sem escala neste dia para {tab}.
            </p>
          ) : (
            <ListaView entries={detalheDia} />
          )}
        </div>
      )}
    </div>
  );
}

function formatDataBR(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function formatDataLonga(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  const dias = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  const d = new Date(`${iso}T12:00:00Z`);
  return `${dias[d.getUTCDay()]} · ${m[3]}/${m[2]}/${m[1]}`;
}

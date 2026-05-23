import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  LETRA_EQUIPE_LABEL,
  type ComposicaoEntry,
  type EscalaMensal,
  type LetraEquipe,
  type LetraEquipeRotativa,
} from '@argus/shared-types';
import { ApiError, api } from '@/lib/api';
import { MasterDetailLayout } from '@/components/desktop/MasterDetailLayout';
import { DataTable, type ColumnDef } from '@/components/desktop/DataTable';
import { useKeyboardShortcut } from '@/components/desktop/KeyboardShortcuts';

/**
 * S2.10.12c — Escalas WEB (master-detail).
 *
 * Layout:
 *   - Master (esquerda 320px): lista de meses agrupada por ano (mais recente
 *     no topo), com badge "atual"
 *   - Detail (direita, flex-1): calendário do mês com chip de equipe
 *     em cada dia + composição q1/q2 lado-a-lado em DataTables
 *
 * Atalhos teclado:
 *   - ← / → muda mês selecionado (escolha do mesmo ano se possível)
 *
 * Upload de XLSX permanece na versão mobile por ora — esta página foca em
 * visualização/exploração. Será integrado em sprint futura se demandado.
 */
const MES_LABEL = [
  '',
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

const EQUIPE_COLOR: Record<LetraEquipe, string> = {
  A: 'bg-emerald-100 text-emerald-900 ring-emerald-300',
  B: 'bg-amber-100 text-amber-900 ring-amber-300',
  C: 'bg-sky-100 text-sky-900 ring-sky-300',
  D: 'bg-rose-100 text-rose-900 ring-rose-300',
  AQUATICAS: 'bg-violet-100 text-violet-900 ring-violet-300',
  STAFF: 'bg-slate-200 text-slate-800 ring-slate-300',
};

interface MesItem {
  ano: number;
  mes: number;
  origemArquivo: string;
  importadoEm: string;
}

export function DesktopEscalasPage() {
  const [selected, setSelected] = useState<{ ano: number; mes: number } | null>(null);

  const { data: lista, isLoading: loadingList } = useQuery({
    queryKey: ['escalas-list'],
    queryFn: async () => (await api.escalasList()).escalas,
    staleTime: 5 * 60 * 1000,
  });

  const { data: detail, isLoading: loadingDetail } = useQuery({
    queryKey: ['escalas-get', selected?.ano, selected?.mes],
    queryFn: async () => {
      if (!selected) return null;
      const r = await api.escalasGet(selected.ano, selected.mes);
      return r.escala;
    },
    enabled: !!selected,
    staleTime: 5 * 60 * 1000,
  });

  // Auto-seleciona o mês mais recente assim que a lista chega
  useEffect(() => {
    if (!selected && lista && lista.length > 0) {
      setSelected({ ano: lista[0].ano, mes: lista[0].mes });
    }
  }, [lista, selected]);

  // Atalhos ← / → para navegar meses
  useKeyboardShortcut('ArrowLeft', () => {
    if (!lista || !selected) return;
    const idx = lista.findIndex((m) => m.ano === selected.ano && m.mes === selected.mes);
    if (idx >= 0 && idx + 1 < lista.length) {
      setSelected({ ano: lista[idx + 1].ano, mes: lista[idx + 1].mes });
    }
  });
  useKeyboardShortcut('ArrowRight', () => {
    if (!lista || !selected) return;
    const idx = lista.findIndex((m) => m.ano === selected.ano && m.mes === selected.mes);
    if (idx > 0) {
      setSelected({ ano: lista[idx - 1].ano, mes: lista[idx - 1].mes });
    }
  });

  return (
    <MasterDetailLayout
      masterWidth="320px"
      toolbar={
        <div className="flex items-center justify-between">
          <h1 className="text-base font-bold text-cbmes-blue">📋 Escalas Mensais</h1>
          <p className="text-xs text-slate-500">Use ← / → para navegar entre meses</p>
        </div>
      }
      master={
        <MesList
          lista={lista ?? []}
          loading={loadingList}
          selected={selected}
          onSelect={setSelected}
        />
      }
      detail={<EscalaDetail loading={loadingDetail} escala={detail ?? null} selected={selected} />}
    />
  );
}

// ── Master: lista de meses ─────────────────────────────────────────

interface MesListProps {
  lista: MesItem[];
  loading: boolean;
  selected: { ano: number; mes: number } | null;
  onSelect: (m: { ano: number; mes: number }) => void;
}

function MesList({ lista, loading, selected, onSelect }: MesListProps) {
  if (loading) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-10 animate-pulse rounded-button bg-slate-100" />
        ))}
      </div>
    );
  }
  if (lista.length === 0) {
    return (
      <div className="p-4 text-sm text-slate-500">
        Nenhuma escala importada ainda. Use a versão mobile para fazer upload XLSX.
      </div>
    );
  }
  // Agrupa por ano para visual mais organizado
  const porAno = useMemo(() => {
    const map = new Map<number, MesItem[]>();
    for (const m of lista) {
      if (!map.has(m.ano)) map.set(m.ano, []);
      map.get(m.ano)!.push(m);
    }
    return [...map.entries()].sort((a, b) => b[0] - a[0]);
  }, [lista]);

  return (
    <nav className="p-2">
      {porAno.map(([ano, meses]) => (
        <div key={ano} className="mb-3">
          <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            {ano}
          </p>
          <ul className="space-y-0.5">
            {meses.map((m) => {
              const isActive = selected?.ano === m.ano && selected?.mes === m.mes;
              return (
                <li key={`${m.ano}-${m.mes}`}>
                  <button
                    type="button"
                    onClick={() => onSelect({ ano: m.ano, mes: m.mes })}
                    className={`flex w-full items-center justify-between rounded-button px-3 py-2 text-left text-sm transition ${
                      isActive
                        ? 'bg-cbmes-blue text-white font-semibold shadow-sm'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span>{MES_LABEL[m.mes]}</span>
                    <span
                      className={`text-[10px] ${isActive ? 'text-white/70' : 'text-slate-400'}`}
                    >
                      {new Date(m.importadoEm).toLocaleDateString('pt-BR')}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

// ── Detail: calendário + composição ────────────────────────────────

interface EscalaDetailProps {
  loading: boolean;
  escala: EscalaMensal | null;
  selected: { ano: number; mes: number } | null;
}

function EscalaDetail({ loading, escala, selected }: EscalaDetailProps) {
  if (!selected) {
    return (
      <div className="flex h-full items-center justify-center p-12 text-center text-slate-400">
        <div>
          <p className="text-4xl">📋</p>
          <p className="mt-3 text-sm">Selecione um mês na lista à esquerda</p>
        </div>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="p-6">
        <div className="h-8 w-64 animate-pulse rounded bg-slate-200" />
        <div className="mt-6 grid grid-cols-7 gap-1">
          {Array.from({ length: 35 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded bg-slate-100" />
          ))}
        </div>
      </div>
    );
  }
  if (!escala) {
    return (
      <div className="p-6 text-sm text-feedback-error">
        Não foi possível carregar a escala de {MES_LABEL[selected.mes]}/{selected.ano}.
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header do mês */}
      <header className="mb-6">
        <h2 className="text-2xl font-bold text-cbmes-blue">
          {MES_LABEL[escala.mes]} de {escala.ano}
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Importado em {new Date(escala.importadoEm).toLocaleString('pt-BR')} · arquivo{' '}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px]">
            {escala.origemArquivo}
          </code>
        </p>
        <LegendaEquipes diaEquipe={escala.diaEquipe} />
      </header>

      {/* Calendário */}
      <section className="mb-8">
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-700">
          📅 Calendário do mês
        </h3>
        <Calendario ano={escala.ano} mes={escala.mes} diaEquipe={escala.diaEquipe} />
      </section>

      {/* Composição por quinzena */}
      <section>
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-700">
          👥 Composição por quinzena
        </h3>
        <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
          <ComposicaoQuinzena
            titulo="1ª quinzena"
            descricao={`Dias 1 a ${escala.composicaoPorQuinzena.ultimoDiaQ1}`}
            entries={escala.composicaoPorQuinzena.q1}
          />
          <ComposicaoQuinzena
            titulo="2ª quinzena"
            descricao={`Dia ${escala.composicaoPorQuinzena.ultimoDiaQ1 + 1} ao último dia`}
            entries={escala.composicaoPorQuinzena.q2}
          />
        </div>
      </section>

      {/* Avisos */}
      {escala.avisos && escala.avisos.length > 0 && (
        <section className="mt-6 rounded border border-feedback-warn/30 bg-feedback-warn/10 p-4">
          <h3 className="text-sm font-bold text-feedback-warn">
            ⚠️ Avisos do parser ({escala.avisos.length})
          </h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-700">
            {escala.avisos.slice(0, 10).map((a, i) => (
              <li key={i}>{a}</li>
            ))}
            {escala.avisos.length > 10 && (
              <li className="italic">… e mais {escala.avisos.length - 10} avisos</li>
            )}
          </ul>
        </section>
      )}
    </div>
  );
}

// ── Calendário ─────────────────────────────────────────────────────

interface CalendarioProps {
  ano: number;
  mes: number;
  diaEquipe: Record<string, LetraEquipeRotativa>;
}

function Calendario({ ano, mes, diaEquipe }: CalendarioProps) {
  const primeiroDia = new Date(ano, mes - 1, 1);
  const diasNoMes = new Date(ano, mes, 0).getDate();
  const padInicial = primeiroDia.getDay(); // 0 = domingo
  const totalCelulas = Math.ceil((padInicial + diasNoMes) / 7) * 7;

  return (
    <div>
      <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase text-slate-500">
        {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: totalCelulas }).map((_, i) => {
          const diaNum = i - padInicial + 1;
          if (diaNum < 1 || diaNum > diasNoMes) {
            return <div key={i} className="h-20 rounded bg-slate-50" />;
          }
          const data = `${ano}-${String(mes).padStart(2, '0')}-${String(diaNum).padStart(2, '0')}`;
          const equipe = diaEquipe[data];
          return (
            <div
              key={i}
              className={`relative h-20 rounded p-2 transition hover:shadow-md ${
                equipe ? EQUIPE_COLOR[equipe] : 'bg-slate-50 text-slate-400'
              }`}
            >
              <p className="text-sm font-bold">{diaNum}</p>
              {equipe && (
                <p className="absolute bottom-1 right-2 text-xl font-black opacity-50">{equipe}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LegendaEquipes({ diaEquipe }: { diaEquipe: Record<string, LetraEquipeRotativa> }) {
  const presentes = new Set(Object.values(diaEquipe));
  if (presentes.size === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {[...presentes].map((e) => (
        <span
          key={e}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-xs font-medium ring-1 ${EQUIPE_COLOR[e]}`}
        >
          <span className="text-sm font-black">{e}</span>
          <span>{LETRA_EQUIPE_LABEL[e]}</span>
        </span>
      ))}
    </div>
  );
}

// ── Composição (DataTable por quinzena) ────────────────────────────

interface ComposicaoQuinzenaProps {
  titulo: string;
  descricao: string;
  entries: ComposicaoEntry[];
}

function ComposicaoQuinzena({ titulo, descricao, entries }: ComposicaoQuinzenaProps) {
  const columns: ColumnDef<ComposicaoEntry>[] = [
    {
      key: 'equipe',
      label: 'Eq',
      width: '60px',
      render: (r) => (
        <span
          className={`inline-block rounded px-2 py-0.5 text-xs font-bold ${EQUIPE_COLOR[r.equipe]}`}
        >
          {r.equipe}
        </span>
      ),
      sortValue: (r) => r.equipe,
    },
    {
      key: 'viatura',
      label: 'Viatura',
      render: (r) => <span className="font-medium">{r.viatura}</span>,
      sortValue: (r) => r.viatura,
    },
    {
      key: 'funcao',
      label: 'Função',
      width: '80px',
      render: (r) => <span className="text-slate-600">{r.funcao}</span>,
      sortValue: (r) => r.funcao,
    },
    {
      key: 'militar',
      label: 'Militar',
      render: (r) => (
        <span className="text-sm text-slate-800">
          {r.militar.postoAbreviado} {r.militar.nomeGuerra}
          {!r.militar.nf && (
            <span title="NF não resolvida" className="ml-1 text-feedback-warn">
              ⚠
            </span>
          )}
        </span>
      ),
      sortValue: (r) => r.militar.nomeGuerra,
    },
    {
      key: 'nf',
      label: 'NF',
      width: '90px',
      render: (r) => <span className="text-xs text-slate-500">{r.militar.nf ?? '—'}</span>,
    },
  ];

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <h4 className="text-sm font-bold text-slate-700">{titulo}</h4>
        <p className="text-[11px] text-slate-500">
          {descricao} · {entries.length} entr{entries.length === 1 ? 'y' : 'ies'}
        </p>
      </div>
      <DataTable
        columns={columns}
        data={entries}
        rowKey={(r) => `${r.equipe}|${r.viatura}|${r.funcao}|${r.militar.raw}`}
        initialSort={{ key: 'equipe', dir: 'asc' }}
        emptyState="Sem composição registrada para esta quinzena."
      />
    </div>
  );
}

// Hint linter: API errors are surfaced via React Query's error boundary
void ApiError;

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '@/lib/api';
import { SkeletonTable } from '@/components/Skeleton';

type Aba = 'habilitados' | 'escalados';

const MARCADOR_DESCRICAO: Record<string, string> = {
  X: 'Escalado',
  Y: 'Reserva',
  S: 'Sobreaviso',
  '*': 'Marcador especial',
};

const POSTO_ORDER = [
  'CEL',
  'TC',
  'MAJ',
  'CAP',
  '1ºTEN',
  '2ºTEN',
  'ASP',
  'SUBTEN',
  '1ºSGT',
  '2ºSGT',
  '3ºSGT',
  'CB',
  'SD',
];
function postoIdx(p: string): number {
  const i = POSTO_ORDER.findIndex((x) => p.toUpperCase().startsWith(x));
  return i < 0 ? 99 : i;
}

/**
 * S2.10.10b — Página dedicada de Chefes de Operações.
 *
 * Duas visões alternáveis:
 *  - **Habilitados**: todos os militares cadastrados como ChOp na planilha
 *    (enriquecidos com posto/nome via Efetivo). Ordenação alfabética por
 *    nome de guerra, com posto agrupado.
 *  - **Escalados do mês**: agrupado por dia (1-31), apenas militares com
 *    marcadores efetivos (X/Y/S/*). Mês corrente da planilha em Postgres
 *    (replace-all — só há 1 mês armazenado).
 *
 * Sincronização sob demanda via botão "🔄 Sincronizar" no header
 * (mesmo padrão do S2.10.10a). Sem cron/startup; dados ficam estáveis
 * até alguém clicar.
 */
const NOMES_MES_PT = [
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

export function ChefesOperacoesPage() {
  const queryClient = useQueryClient();
  const hoje = new Date();
  const [aba, setAba] = useState<Aba>('escalados');
  const [ano, setAno] = useState<number>(hoje.getFullYear());
  const [mes, setMes] = useState<number>(hoje.getMonth() + 1);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const {
    data: habilitados = [],
    isLoading: loadingHabilitados,
    error: errorHabilitados,
  } = useQuery({
    queryKey: ['chefes-operacoes-habilitados'],
    queryFn: () => api.chefesOperacoesHabilitados(),
    staleTime: 5 * 60 * 1000,
  });

  const {
    data: escaladosMes = [],
    isLoading: loadingEscalados,
    error: errorEscalados,
  } = useQuery({
    queryKey: ['chefes-operacoes-escalados-mes', ano, mes],
    queryFn: () => api.chefesOperacoesEscaladosMes(ano, mes),
    staleTime: 5 * 60 * 1000,
  });

  const { data: mesesDisponiveis = [] } = useQuery({
    queryKey: ['chefes-operacoes-meses-disponiveis'],
    queryFn: () => api.chefesOperacoesMesesDisponiveis(),
    staleTime: 5 * 60 * 1000,
  });

  const error = errorHabilitados ?? errorEscalados;
  const errorMsg = error
    ? error instanceof ApiError
      ? error.message
      : 'Erro ao carregar ChOp'
    : null;

  const handleSync = async (): Promise<void> => {
    setSyncBusy(true);
    setSyncMsg(null);
    try {
      const r = await api.integracoesSync('chefes-operacoes');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['chefes-operacoes-habilitados'] }),
        queryClient.invalidateQueries({ queryKey: ['chefes-operacoes-escalados-mes'] }),
        queryClient.invalidateQueries({ queryKey: ['chefes-operacoes-meses-disponiveis'] }),
      ]);
      setSyncMsg(`ChOp sincronizado · ${r.qtdRegistros} entries`);
    } catch (e) {
      setSyncMsg(e instanceof ApiError ? e.message : 'Falha ao sincronizar');
    } finally {
      setSyncBusy(false);
    }
  };

  // Lista para o seletor: meses presentes no banco + o mês selecionado (caso
  // o usuário tenha escolhido um que ainda não foi sincronizado).
  const opcoesMes = [...mesesDisponiveis];
  if (!opcoesMes.some((o) => o.ano === ano && o.mes === mes)) {
    opcoesMes.push({ ano, mes });
  }
  opcoesMes.sort((a, b) => b.ano - a.ano || b.mes - a.mes);

  const habilitadosOrdenados = [...habilitados].sort((a, b) => {
    const pi = postoIdx(a.posto) - postoIdx(b.posto);
    if (pi !== 0) return pi;
    return a.nomeGuerra.localeCompare(b.nomeGuerra);
  });

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-cbmes-blue px-4 py-4 text-white">
        <Link to="/" className="text-sm opacity-90 hover:opacity-100">
          ← Home
        </Link>
        <h1 className="mt-1 text-lg font-bold">👮 Chefes de Operações</h1>
        <p className="text-xs opacity-90">
          Escala ChOp · CBMES (todos os oficiais) · planilha externa (Google Sheets) · read-only
        </p>
      </header>

      <section className="mx-auto max-w-5xl p-4">
        <div className="rounded border border-slate-200 bg-white p-3 text-xs text-slate-600">
          <strong>Fonte:</strong> planilha institucional "Escala de Chefe de Operações" — abas
          mensais com oficiais de toda a instituição. Histórico multi-mês em Postgres desde
          S2.10.11b. Alterações são raras (&lt;1 por mês) — clique em sincronizar quando a planilha
          for editada.
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex rounded border border-slate-300 bg-white">
            <button
              type="button"
              onClick={() => setAba('escalados')}
              className={`rounded-l px-3 py-1.5 text-sm transition ${
                aba === 'escalados'
                  ? 'bg-cbmes-blue text-white'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              📆 Escalados do mês
            </button>
            <button
              type="button"
              onClick={() => setAba('habilitados')}
              className={`rounded-r px-3 py-1.5 text-sm transition ${
                aba === 'habilitados'
                  ? 'bg-cbmes-blue text-white'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              👥 Habilitados ({habilitados.length})
            </button>
          </div>

          <div className="flex items-center gap-2">
            {aba === 'escalados' && (
              <select
                value={`${ano}-${mes}`}
                onChange={(e) => {
                  const [a, m] = e.target.value.split('-').map((n) => Number.parseInt(n, 10)) as [
                    number,
                    number,
                  ];
                  setAno(a);
                  setMes(m);
                }}
                className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700"
                title="Mês da escala"
              >
                {opcoesMes.map((o) => (
                  <option key={`${o.ano}-${o.mes}`} value={`${o.ano}-${o.mes}`}>
                    {NOMES_MES_PT[o.mes]} {o.ano}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={() => void handleSync()}
              disabled={syncBusy}
              title="Re-sincronizar todas as abas mensais da planilha de ChOp"
              className="rounded-button border border-cbmes-blue bg-white px-3 py-2 text-sm font-medium text-cbmes-blue hover:bg-cbmes-blue/5 disabled:opacity-50"
            >
              {syncBusy ? '⟳ Sincronizando…' : '🔄 Sincronizar'}
            </button>
          </div>
        </div>

        {syncMsg && (
          <div className="mt-2 rounded border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700">
            {syncMsg}
          </div>
        )}

        {errorMsg && (
          <div className="mt-3 rounded border border-feedback-error/30 bg-feedback-error/10 p-3 text-sm text-feedback-error">
            {errorMsg}
          </div>
        )}

        {aba === 'escalados' && (
          <div className="mt-4">
            {loadingEscalados ? (
              <SkeletonTable rows={8} cols={3} />
            ) : escaladosMes.length === 0 ? (
              <p className="rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                Nenhum dia com militar escalado no mês corrente. Se a planilha foi atualizada,
                clique em <strong>🔄 Sincronizar</strong>.
              </p>
            ) : (
              <ul className="space-y-2">
                {escaladosMes.map(({ dia, militares }) => (
                  <li key={dia} className="rounded border border-slate-200 bg-white p-3 text-sm">
                    <div className="mb-2 flex items-baseline gap-2">
                      <strong className="text-slate-900">Dia {String(dia).padStart(2, '0')}</strong>
                      <span className="text-xs text-slate-500">
                        {militares.length} militar{militares.length === 1 ? '' : 'es'}
                      </span>
                    </div>
                    <ul className="space-y-1">
                      {militares.map((m) => (
                        <li key={`${dia}-${m.nf}`} className="flex flex-wrap items-baseline gap-2">
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                            {m.marcador ?? '?'} ·{' '}
                            {(m.marcador && MARCADOR_DESCRICAO[m.marcador]) ?? 'marcador'}
                          </span>
                          <span className="text-slate-700">
                            <strong>{m.posto}</strong> {m.nomeGuerra}
                          </span>
                          <span className="text-xs text-slate-500">NF {m.nf}</span>
                          {m.telefone && (
                            <span className="text-xs text-slate-500">· {m.telefone}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {aba === 'habilitados' && (
          <div className="mt-4">
            {loadingHabilitados ? (
              <SkeletonTable rows={10} cols={3} />
            ) : habilitadosOrdenados.length === 0 ? (
              <p className="rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                Nenhum militar habilitado. Se a planilha foi populada, clique em{' '}
                <strong>🔄 Sincronizar</strong>.
              </p>
            ) : (
              <div className="overflow-x-auto rounded border border-slate-200 bg-white">
                <table className="min-w-full text-xs">
                  <thead className="bg-slate-100">
                    <tr className="text-left">
                      <th className="px-3 py-2">Posto</th>
                      <th className="px-3 py-2">Nome de guerra</th>
                      <th className="px-3 py-2">NF</th>
                    </tr>
                  </thead>
                  <tbody>
                    {habilitadosOrdenados.map((h) => (
                      <tr key={h.nf} className="border-t border-slate-100">
                        <td className="px-3 py-2 font-semibold text-slate-700">{h.posto}</td>
                        <td className="px-3 py-2 text-slate-800">{h.nomeGuerra}</td>
                        <td className="px-3 py-2 text-slate-500">{h.nf}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}

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

  // S2.14 — DB vazio implica que a carga inicial ainda não rodou. UI mostra
  // somente o botão "Carregar planilha inicial" nesse estado. Após a 1ª carga,
  // os 2 botões dedicados ("Atualizar este mês" e "Buscar próximo mês") assumem.
  const dbVazio = mesesDisponiveis.length === 0;

  // S2.14 — Tom da mensagem (info | warn | error). Mensagens "amarelas" usadas
  // quando "próximo mês não disponível" (estado esperado, não erro).
  const [syncTone, setSyncTone] = useState<'info' | 'warn' | 'error'>('info');

  const invalidateChopQueries = async (): Promise<void> => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['chefes-operacoes-habilitados'] }),
      queryClient.invalidateQueries({ queryKey: ['chefes-operacoes-escalados-mes'] }),
      queryClient.invalidateQueries({ queryKey: ['chefes-operacoes-meses-disponiveis'] }),
    ]);
  };

  /**
   * S2.14 — Carga inicial (bulk): chamada apenas quando DB está vazio.
   * Reusa o endpoint `POST /integracoes/chefes-operacoes/sync` que importa
   * todas as 12 abas em paralelo.
   */
  const handleCargaInicial = async (): Promise<void> => {
    setSyncBusy(true);
    setSyncMsg(null);
    try {
      const r = await api.integracoesSync('chefes-operacoes');
      await invalidateChopQueries();
      setSyncTone('info');
      setSyncMsg(`Carga inicial concluída · ${r.qtdRegistros} entries`);
    } catch (e) {
      setSyncTone('error');
      setSyncMsg(e instanceof ApiError ? e.message : 'Falha na carga inicial');
    } finally {
      setSyncBusy(false);
    }
  };

  /**
   * S2.14 — Atualiza apenas o mês atualmente selecionado no dropdown.
   * Operação rápida e idempotente: substitui o mês inteiro em transaction.
   */
  const handleAtualizarMes = async (): Promise<void> => {
    setSyncBusy(true);
    setSyncMsg(null);
    try {
      const r = await api.chefesOperacoesSyncMes(ano, mes);
      await invalidateChopQueries();
      setSyncTone('info');
      setSyncMsg(`${NOMES_MES_PT[mes]} ${ano} atualizado · ${r.created} entries`);
    } catch (e) {
      setSyncTone('error');
      setSyncMsg(e instanceof ApiError ? e.message : 'Falha ao atualizar mês');
    } finally {
      setSyncBusy(false);
    }
  };

  /**
   * S2.14 — Detecta o último mês carregado no DB e tenta importar o
   * seguinte. Trata 2 caminhos discriminados: sucesso (ano/mes/result) e
   * indisponível ({disponivel:false, mensagem}).
   */
  const handleBuscarProximo = async (): Promise<void> => {
    setSyncBusy(true);
    setSyncMsg(null);
    try {
      const r = await api.chefesOperacoesSyncProximoMes();
      if ('disponivel' in r && r.disponivel === false) {
        setSyncTone('warn');
        setSyncMsg(r.mensagem);
        return;
      }
      if ('ano' in r && 'mes' in r) {
        await invalidateChopQueries();
        // Move a visualização para o novo mês
        setAno(r.ano);
        setMes(r.mes);
        setSyncTone('info');
        setSyncMsg(`${NOMES_MES_PT[r.mes]} ${r.ano} importado · ${r.result.created} entries`);
      }
    } catch (e) {
      setSyncTone('error');
      setSyncMsg(e instanceof ApiError ? e.message : 'Falha ao buscar próximo mês');
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
          S2.10.11b.{' '}
          {dbVazio ? (
            <>
              Banco vazio: use <strong>"Carregar planilha inicial"</strong> para popular os 12 meses
              do ano corrente.
            </>
          ) : (
            <>
              Use <strong>"🔄 Atualizar este mês"</strong> quando o sargenteante editar um mês já
              carregado. Use <strong>"⏭ Buscar próximo mês"</strong> para importar o mês seguinte
              assim que a aba for criada na planilha.
            </>
          )}
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

          <div className="flex flex-wrap items-center gap-2">
            {aba === 'escalados' && !dbVazio && (
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
            {dbVazio ? (
              // S2.14 — DB vazio: bulk inicial das 12 abas em paralelo
              <button
                type="button"
                onClick={() => void handleCargaInicial()}
                disabled={syncBusy}
                title="Importar todas as 12 abas mensais da planilha (1ª vez)"
                className="rounded-button border border-cbmes-blue bg-cbmes-blue px-3 py-2 text-sm font-medium text-white hover:bg-cbmes-blue/90 disabled:opacity-50"
              >
                {syncBusy ? '⟳ Carregando…' : '📥 Carregar planilha inicial'}
              </button>
            ) : (
              // S2.14 — DB com dados: 2 botões dedicados
              <>
                <button
                  type="button"
                  onClick={() => void handleAtualizarMes()}
                  disabled={syncBusy}
                  title={`Re-importar apenas ${NOMES_MES_PT[mes]} ${ano} da planilha`}
                  className="rounded-button border border-cbmes-blue bg-white px-3 py-2 text-sm font-medium text-cbmes-blue hover:bg-cbmes-blue/5 disabled:opacity-50"
                >
                  {syncBusy ? '⟳ Atualizando…' : '🔄 Atualizar este mês'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleBuscarProximo()}
                  disabled={syncBusy}
                  title="Importar o mês seguinte ao último carregado (se a aba existir na planilha)"
                  className="rounded-button border border-cbmes-blue bg-white px-3 py-2 text-sm font-medium text-cbmes-blue hover:bg-cbmes-blue/5 disabled:opacity-50"
                >
                  {syncBusy ? '⟳ Buscando…' : '⏭ Buscar próximo mês'}
                </button>
              </>
            )}
          </div>
        </div>

        {syncMsg && (
          <div
            className={`mt-2 rounded border px-3 py-1.5 text-xs ${
              syncTone === 'error'
                ? 'border-feedback-error/30 bg-feedback-error/10 text-feedback-error'
                : syncTone === 'warn'
                  ? 'border-amber-300 bg-amber-50 text-amber-800'
                  : 'border-slate-200 bg-slate-50 text-slate-700'
            }`}
          >
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

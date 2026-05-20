import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DayPicker, type DayButtonProps } from 'react-day-picker';
import { ptBR } from 'date-fns/locale';
import 'react-day-picker/dist/style.css';
import { ApiError, api } from '@/lib/api';

const LETRA_EQUIPE_LABEL: Record<string, string> = {
  A: 'ALFA',
  B: 'BRAVO',
  C: 'CHARLIE',
  D: 'DELTA',
  AQUATICAS: 'AQUÁTICAS',
  STAFF: 'STAFF',
};

const LETRA_EQUIPE_BADGE: Record<string, string> = {
  A: 'bg-emerald-500/15 text-emerald-700',
  B: 'bg-cyan-500/15 text-cyan-700',
  C: 'bg-amber-500/15 text-amber-800',
  D: 'bg-fuchsia-500/15 text-fuchsia-700',
  AQUATICAS: 'bg-blue-500/15 text-blue-700',
  STAFF: 'bg-slate-300 text-slate-700',
};

/**
 * Cores fortes (bg + texto) para a célula do calendário, espelhando a paleta
 * usada no badge da lista para reforço visual cruzado.
 */
const LETRA_EQUIPE_CALENDARIO: Record<string, { bg: string; text: string }> = {
  A: { bg: 'rgb(16 185 129 / 0.18)', text: 'rgb(4 120 87)' }, // emerald
  B: { bg: 'rgb(6 182 212 / 0.18)', text: 'rgb(14 116 144)' }, // cyan
  C: { bg: 'rgb(245 158 11 / 0.20)', text: 'rgb(146 64 14)' }, // amber
  D: { bg: 'rgb(217 70 239 / 0.18)', text: 'rgb(134 25 143)' }, // fuchsia
  AQUATICAS: { bg: 'rgb(59 130 246 / 0.18)', text: 'rgb(29 78 216)' }, // blue
  STAFF: { bg: 'rgb(203 213 225 / 0.50)', text: 'rgb(51 65 85)' }, // slate
};

/**
 * S0.x/rename-mapa-forca — Tela do Mapa Força (entrada do módulo).
 *
 * Apresenta um calendário (PT-BR) ou lista dos dias de serviço com escala
 * XLSX importada. Cada dia escalado é colorido conforme a equipe (A/B/C/D
 * ou AQUATICAS/STAFF) e mostra a letra logo abaixo do número.
 *
 * Click em um dia abre `/mapa-forca/:data` em modo READ-ONLY por padrão.
 * A edição é liberada apenas para o Fiscal escalado (ou admin) via botão
 * "Iniciar Prévia do Mapa Força" na tela de detalhe.
 *
 * Sem carregamento prévio dos dados do dia atual — o usuário escolhe.
 */
export function MapaForcaPage() {
  const navigate = useNavigate();
  const today = new Date();
  const [mes, setMes] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [viewMode, setViewMode] = useState<'calendario' | 'lista'>('calendario');
  const [diasComEscala, setDiasComEscala] = useState<string[]>([]);
  const [equipePorDia, setEquipePorDia] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // S2.10.9a — Botão "Atualizar Mapa Força CIODES" (fonte real-time only,
  // não persiste em Postgres). Útil quando o Fiscal sabe que houve mudança
  // na planilha e quer ver o snapshot mais recente antes do TTL expirar.
  const [syncCiodesBusy, setSyncCiodesBusy] = useState(false);
  const [syncCiodesMsg, setSyncCiodesMsg] = useState<string | null>(null);

  const handleSyncCiodes = async (): Promise<void> => {
    setSyncCiodesBusy(true);
    setSyncCiodesMsg(null);
    try {
      const r = await api.integracoesSync('mapa-forca-ciodes');
      setSyncCiodesMsg(`Mapa Força CIODES atualizado · ${r.qtdRegistros} recursos`);
    } catch (e) {
      setSyncCiodesMsg(e instanceof ApiError ? e.message : 'Falha ao atualizar');
    } finally {
      setSyncCiodesBusy(false);
    }
  };

  const ano = mes.getFullYear();
  const mesNum = mes.getMonth() + 1;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .escalasDiasDisponiveis(ano, mesNum)
      .then((r) => {
        if (cancelled) return;
        setDiasComEscala(r.dias);
        setEquipePorDia(r.equipePorDia);
        setError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof ApiError ? e.message : 'Erro ao carregar dias');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ano, mesNum]);

  const diasSet = useMemo(() => new Set(diasComEscala), [diasComEscala]);

  const handleDaySelect = (date: Date | undefined): void => {
    if (!date) return;
    const iso = formatIsoDate(date);
    if (!diasSet.has(iso)) return;
    navigate(`/mapa-forca/${iso}`);
  };

  /**
   * Custom DayButton — destaca dias escalados com cor da equipe + letra
   * logo abaixo do número do dia. Dias sem escala renderizam padrão (faded).
   */
  const DayButton = (props: DayButtonProps) => {
    const { day, children, modifiers: _modifiers, ...rest } = props;
    const iso = formatIsoDate(day.date);
    const equipe = equipePorDia[iso];
    const escalado = diasSet.has(iso);
    const palette = equipe ? LETRA_EQUIPE_CALENDARIO[equipe] : null;
    const isOutside = !day.outside ? false : true;

    if (!escalado) {
      return (
        <button
          {...rest}
          type="button"
          disabled
          className={`flex h-12 w-full flex-col items-center justify-center rounded text-sm ${
            isOutside ? 'text-slate-300' : 'text-slate-400'
          } cursor-not-allowed`}
        >
          {children}
        </button>
      );
    }

    return (
      <button
        {...rest}
        type="button"
        className="flex h-12 w-full flex-col items-center justify-center rounded text-sm font-semibold transition hover:brightness-95"
        style={
          palette
            ? { backgroundColor: palette.bg, color: palette.text }
            : { backgroundColor: 'rgb(31 56 100 / 0.10)', color: '#1F3864' }
        }
        title={equipe ? `Equipe ${LETRA_EQUIPE_LABEL[equipe] ?? equipe}` : undefined}
      >
        <span className="leading-none">{children}</span>
        {equipe && (
          <span className="mt-0.5 text-[10px] font-bold tracking-widest opacity-90">{equipe}</span>
        )}
      </button>
    );
  };

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-cbmes-red px-4 py-4 text-white">
        <Link to="/" className="text-sm opacity-90 hover:opacity-100">
          ← Início
        </Link>
        <h1 className="mt-1 text-lg font-bold">Mapa Força</h1>
        <p className="text-xs opacity-90">
          Visão por dia de serviço · escolha um dia escalado abaixo para conferir
        </p>
      </header>

      <section className="mx-auto max-w-3xl p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMes(new Date(ano, mesNum - 2, 1))}
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
              aria-label="Mês anterior"
            >
              ←
            </button>
            <span className="min-w-[180px] text-center text-sm font-semibold capitalize text-slate-700">
              {mes.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
            </span>
            <button
              type="button"
              onClick={() => setMes(new Date(ano, mesNum, 1))}
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
              aria-label="Próximo mês"
            >
              →
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSyncCiodes}
              disabled={syncCiodesBusy}
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              title="Re-sincroniza o Mapa Força CIODES (fonte real-time, fora do cron)"
            >
              {syncCiodesBusy ? 'Atualizando…' : '↻ Atualizar CIODES'}
            </button>
            <div className="inline-flex rounded border border-slate-300 bg-white">
              <button
                type="button"
                onClick={() => setViewMode('calendario')}
                className={`rounded-l px-3 py-1.5 text-sm transition ${
                  viewMode === 'calendario'
                    ? 'bg-cbmes-blue text-white'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                Calendário
              </button>
              <button
                type="button"
                onClick={() => setViewMode('lista')}
                className={`rounded-r px-3 py-1.5 text-sm transition ${
                  viewMode === 'lista'
                    ? 'bg-cbmes-blue text-white'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                Lista
              </button>
            </div>
          </div>
        </div>

        {syncCiodesMsg && (
          <div className="mt-2 rounded border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
            {syncCiodesMsg}
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="mt-4 rounded border border-feedback-error/30 bg-feedback-error/10 p-3 text-sm text-feedback-error"
          >
            {error}
          </div>
        )}

        {loading && <p className="mt-4 text-center text-sm text-slate-500">Carregando…</p>}

        {!loading && diasComEscala.length === 0 && !error && (
          <div className="mt-6 rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            Nenhuma escala XLSX importada para{' '}
            <strong>
              {String(mesNum).padStart(2, '0')}/{ano}
            </strong>
            . Importe pela seção{' '}
            <Link to="/cadastros/escalas" className="underline">
              Escala Mensal
            </Link>
            .
          </div>
        )}

        {!loading && diasComEscala.length > 0 && viewMode === 'calendario' && (
          <div className="mt-4 flex justify-center rounded border border-slate-200 bg-white p-3">
            <DayPicker
              mode="single"
              month={mes}
              onMonthChange={setMes}
              onSelect={handleDaySelect}
              showOutsideDays
              fixedWeeks
              locale={ptBR}
              components={{ DayButton }}
            />
            <style>{`
              .rdp { --rdp-accent-color: #1F3864; --rdp-cell-size: 48px; margin: 0 auto; }
              .rdp-day { padding: 1px; }
              .rdp-caption_label { text-transform: capitalize; }
            `}</style>
          </div>
        )}

        {!loading && diasComEscala.length > 0 && viewMode === 'calendario' && (
          <p className="mt-2 text-center text-[11px] italic text-slate-500">
            Dias coloridos têm escala importada · letra abaixo do número indica a equipe. Toque em
            um dia para abrir o Mapa Força.
          </p>
        )}

        {!loading && diasComEscala.length > 0 && viewMode === 'lista' && (
          <ul className="mt-4 divide-y divide-slate-200 rounded border border-slate-200 bg-white">
            {diasComEscala.map((iso) => {
              const equipe = equipePorDia[iso];
              const date = parseIsoDate(iso);
              const diaSemana = date.toLocaleDateString('pt-BR', { weekday: 'short' });
              return (
                <li key={iso}>
                  <Link
                    to={`/mapa-forca/${iso}`}
                    className="flex items-center justify-between px-4 py-3 transition hover:bg-cbmes-blue/5"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-800">
                        {date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}
                        <span className="ml-2 text-xs uppercase text-slate-500">{diaSemana}</span>
                      </p>
                      <p className="text-xs text-slate-500">{iso}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {equipe && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            LETRA_EQUIPE_BADGE[equipe] ?? 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {LETRA_EQUIPE_LABEL[equipe] ?? equipe}
                        </span>
                      )}
                      <span aria-hidden className="text-cbmes-blue">
                        ➜
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}

function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
}

function formatIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

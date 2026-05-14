import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DayPicker } from 'react-day-picker';
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
 * S0.x/rename-mapa-forca — Tela do Mapa Força (entrada do módulo).
 *
 * Apresenta um calendário (ou lista) dos dias de serviço com escala XLSX
 * importada. Click em um dia abre `/mapa-forca/:data` em modo READ-ONLY
 * por padrão. A edição é liberada apenas para o Fiscal escalado (ou admin)
 * via botão "Iniciar Prévia do Mapa Força" na tela de detalhe.
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
  const diasDate = useMemo(
    () => diasComEscala.map((iso) => parseIsoDate(iso)),
    [diasComEscala],
  );

  const handleDaySelect = (date: Date | undefined): void => {
    if (!date) return;
    const iso = formatIsoDate(date);
    if (!diasSet.has(iso)) return;
    navigate(`/mapa-forca/${iso}`);
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
            <span className="min-w-[150px] text-center text-sm font-semibold text-slate-700">
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

        {error && (
          <div
            role="alert"
            className="mt-4 rounded border border-feedback-error/30 bg-feedback-error/10 p-3 text-sm text-feedback-error"
          >
            {error}
          </div>
        )}

        {loading && (
          <p className="mt-4 text-center text-sm text-slate-500">Carregando…</p>
        )}

        {!loading && diasComEscala.length === 0 && !error && (
          <div className="mt-6 rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            Nenhuma escala XLSX importada para{' '}
            <strong>
              {String(mesNum).padStart(2, '0')}/{ano}
            </strong>
            . Importe pela seção <Link to="/cadastros/escalas" className="underline">Escala Mensal</Link>.
          </div>
        )}

        {!loading && diasComEscala.length > 0 && viewMode === 'calendario' && (
          <div className="mt-4 rounded border border-slate-200 bg-white p-3">
            <DayPicker
              mode="single"
              month={mes}
              onMonthChange={setMes}
              onSelect={handleDaySelect}
              modifiers={{ escalado: diasDate }}
              modifiersClassNames={{
                escalado: 'rdp-day_escalado',
                disabled: 'opacity-30',
              }}
              disabled={(date) => !diasSet.has(formatIsoDate(date))}
              showOutsideDays
              fixedWeeks
              locale={undefined}
            />
            <style>{`
              .rdp { --rdp-accent-color: #1F3864; --rdp-cell-size: 40px; }
              .rdp-day_escalado:not(.rdp-day_disabled) {
                background-color: rgba(31, 56, 100, 0.1);
                font-weight: 600;
                color: #1F3864;
                cursor: pointer;
              }
              .rdp-day_escalado:not(.rdp-day_disabled):hover {
                background-color: rgba(31, 56, 100, 0.2);
              }
            `}</style>
            <p className="mt-2 text-[11px] italic text-slate-500">
              Dias destacados têm escala importada. Toque em um dia para abrir o Mapa Força.
            </p>
          </div>
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

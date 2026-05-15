import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { IseoHospitalEntry } from '@argus/shared-types';
import { ApiError, api } from '@/lib/api';

type Unidade = 'HPM' | 'HIMABA';

const POSTO_ORDER = [
  'CEL', 'TC', 'MAJ', 'CAP', '1ºTEN', '2ºTEN', 'ASP',
  'SUBTEN', '1ºSGT', '2ºSGT', '3ºSGT', 'CB', 'SD',
];
function postoIdx(p: string): number {
  const i = POSTO_ORDER.findIndex((x) => p.toUpperCase().startsWith(x));
  return i < 0 ? 99 : i;
}

/**
 * Página Sargenteação: escala ISEO Hospitais (HPM + HIMABA).
 * Read-only. A fonte é a planilha pública via CSV; cache 5min no backend.
 * As entradas alimentam a Agenda do militar (módulo Agenda).
 */
export function IseoHospitaisPage() {
  const [todas, setTodas] = useState<IseoHospitalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Unidade>('HPM');
  const [filtroData, setFiltroData] = useState<string>('');
  const [filtroMilitar, setFiltroMilitar] = useState<string>('');
  const [apenasFuturas, setApenasFuturas] = useState(true);

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

  const filtradas = useMemo(() => {
    const hoje = new Date().toISOString().slice(0, 10);
    return todas
      .filter((e) => e.unidade === tab)
      .filter((e) => {
        if (filtroData && e.dataIso !== filtroData) return false;
        if (filtroMilitar) {
          const n = filtroMilitar.toUpperCase();
          if (!e.nome.toUpperCase().includes(n) && !e.nf.includes(n)) return false;
        }
        if (apenasFuturas && e.dataIso < hoje) return false;
        return true;
      })
      .sort((a, b) => {
        if (a.dataIso !== b.dataIso) return a.dataIso.localeCompare(b.dataIso);
        if (a.turno !== b.turno) return a.turno === 'Diurno' ? -1 : 1;
        const pi = postoIdx(a.posto) - postoIdx(b.posto);
        if (pi !== 0) return pi;
        return a.nome.localeCompare(b.nome);
      });
  }, [todas, tab, filtroData, filtroMilitar, apenasFuturas]);

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

        <div className="mt-3 flex gap-2">
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
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 rounded border border-slate-200 bg-white p-3 sm:grid-cols-[1fr_1fr_auto]">
          <label className="block">
            <span className="text-[10px] uppercase tracking-wide text-slate-500">Data</span>
            <input
              type="date"
              value={filtroData}
              onChange={(e) => setFiltroData(e.target.value)}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-2 text-sm"
            />
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
          <label className="flex items-center gap-2 self-end pb-2">
            <input
              type="checkbox"
              checked={apenasFuturas}
              onChange={(e) => setApenasFuturas(e.target.checked)}
              className="h-4 w-4"
            />
            <span className="text-xs text-slate-700">Apenas futuras</span>
          </label>
        </div>

        {loading ? (
          <p className="mt-4 text-sm text-slate-500">Carregando escala…</p>
        ) : filtradas.length === 0 ? (
          <p className="mt-4 text-sm italic text-slate-500">
            Nenhuma escala encontrada para {tab} com os filtros atuais.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {filtradas.map((e, i) => (
              <li
                key={`${e.unidade}-${e.dataIso}-${e.turno}-${e.nf}-${i}`}
                className="rounded border border-slate-200 bg-white p-3 text-sm"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-semibold text-slate-900">
                    {formatDataBR(e.dataIso)}
                  </span>
                  <span
                    className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                      e.turno === 'Diurno' ? 'bg-amber-100 text-amber-800' : 'bg-indigo-100 text-indigo-800'
                    }`}
                  >
                    {e.turno}
                  </span>
                  <span className="text-xs text-slate-600">{e.unidade}</span>
                </div>
                <div className="mt-1 text-slate-800">
                  <strong>{e.posto}</strong> {e.nome} <span className="text-slate-500">· NF {e.nf}</span>
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
        )}
      </section>
    </main>
  );
}

function formatDataBR(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

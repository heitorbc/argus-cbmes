import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  STATUS_VIATURA_LABEL,
  type ContatoLogistico,
  type StatusViatura,
  type Viatura,
  type ViaturaEnriquecida,
} from '@argus/shared-types';
import { ApiError, api } from '@/lib/api';
import { STATUS_VIATURA_BADGE } from '@/lib/status-viatura-style';

/**
 * S0.x — Página unificada de viaturas: lista vem do QDV/1BBM_1CIA
 * (fonte de verdade), enriquecida com BASE_LISTA + BASE_VTR_LISTA_PRINCIPAL
 * + Mapa Força. Clique na linha → `/cadastros/viaturas/:prefixo` para
 * detalhe completo + edição dos campos operacionais.
 */
export function ViaturasPage() {
  const [enriquecidas, setEnriquecidas] = useState<ViaturaEnriquecida[]>([]);
  const [internas, setInternas] = useState<Viatura[]>([]);
  const [contatoResponsavel, setContatoResponsavel] = useState<ContatoLogistico | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([api.viaturasEnriquecidas(), api.viaturasList().catch(() => [])])
      .then(([enr, list]) => {
        if (cancelled) return;
        setEnriquecidas(enr.items);
        setContatoResponsavel(enr.contatoResponsavel);
        setInternas(list);
        setError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof ApiError ? e.message : 'Erro ao carregar viaturas');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // KM Atual: override interno tem precedência sobre QDV
  const kmByPrefixo = new Map(
    internas
      .filter((v) => v.kmAtual !== undefined)
      .map((v) => [normalizePrefixo(v.prefixo), v.kmAtual as number]),
  );

  const termo = filtro.trim().toLowerCase();
  const items = termo
    ? enriquecidas.filter(
        (v) =>
          v.prefixo.toLowerCase().includes(termo) ||
          (v.nomenclatura ?? '').toLowerCase().includes(termo) ||
          (v.placa ?? '').toLowerCase().includes(termo),
      )
    : enriquecidas;

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-cbmes-red px-4 py-4 text-white">
        <Link to="/" className="text-sm opacity-90 hover:opacity-100">
          ← Início
        </Link>
        <h1 className="mt-1 text-lg font-bold">Viaturas — 1ºBBM/1ªCIA</h1>
        <p className="text-xs opacity-90">
          Frota da unidade · dados da QDV enriquecidos com Mapa Força
        </p>
        {contatoResponsavel && (
          <div className="mt-3 rounded border border-white/20 bg-white/10 p-2 text-xs">
            <p className="font-semibold uppercase tracking-wide opacity-80">
              Responsável logístico
            </p>
            <p className="mt-0.5">
              <strong>{contatoResponsavel.militarResponsavel}</strong>
              {contatoResponsavel.nomeCompleto && ` · ${contatoResponsavel.nomeCompleto}`}
            </p>
            {(contatoResponsavel.telefone || contatoResponsavel.email) && (
              <p className="mt-0.5 opacity-90">
                {contatoResponsavel.telefone && `📞 ${contatoResponsavel.telefone}`}
                {contatoResponsavel.telefone && contatoResponsavel.email && ' · '}
                {contatoResponsavel.email && `✉️ ${contatoResponsavel.email}`}
              </p>
            )}
          </div>
        )}
      </header>

      <section className="mx-auto max-w-4xl p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-600">
            {items.length} viatura{items.length === 1 ? '' : 's'}
            {termo && enriquecidas.length !== items.length && ` (de ${enriquecidas.length})`}
          </p>
          <input
            type="search"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Filtrar por prefixo, nomenclatura ou placa"
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm sm:w-72"
          />
        </div>

        {error && (
          <div
            role="alert"
            className="mt-4 rounded border border-feedback-error/30 bg-feedback-error/10 p-3 text-sm text-feedback-error"
          >
            {error}
          </div>
        )}

        {loading && items.length === 0 && (
          <p className="mt-6 text-center text-sm text-slate-500">Carregando viaturas…</p>
        )}

        {!loading && items.length === 0 && !error && (
          <p className="mt-6 text-center text-sm text-slate-500">Nenhuma viatura encontrada.</p>
        )}

        {items.length > 0 && (
          <div className="mt-4 overflow-x-auto rounded border border-slate-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-3 py-2 text-left">Prefixo</th>
                  <th className="px-3 py-2 text-left">Nomenclatura</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-right">KM Atual</th>
                  <th className="px-3 py-2 text-left">Placa</th>
                  <th className="px-3 py-2 text-left">Tipo veículo</th>
                  <th className="px-3 py-2 text-left">Emprego</th>
                </tr>
              </thead>
              <tbody>
                {items.map((v) => {
                  const kmInterno = kmByPrefixo.get(normalizePrefixo(v.prefixo));
                  const km = kmInterno ?? v.kmAtual;
                  const statusEfetivo: StatusViatura | null = v.statusMf ?? null;
                  return (
                    <tr
                      key={v.prefixo}
                      className="cursor-pointer border-t border-slate-100 hover:bg-cbmes-blue/5"
                    >
                      <td className="px-3 py-2">
                        <Link
                          to={`/cadastros/viaturas/${encodeURIComponent(v.prefixo)}`}
                          className="font-medium text-cbmes-blue hover:underline"
                        >
                          {v.prefixo}
                        </Link>
                      </td>
                      <td className="px-3 py-2">{v.nomenclatura ?? '—'}</td>
                      <td className="px-3 py-2">
                        {statusEfetivo ? (
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_VIATURA_BADGE[statusEfetivo]}`}
                          >
                            {STATUS_VIATURA_LABEL[statusEfetivo]}
                          </span>
                        ) : (
                          <span className="text-slate-500">{v.statusQdv ?? '—'}</span>
                        )}
                        {v.emprestadaA && (
                          <span className="ml-1 text-[10px] italic text-amber-700">
                            → {v.emprestadaA}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {km !== undefined ? km.toLocaleString('pt-BR') : '—'}
                      </td>
                      <td className="px-3 py-2 font-mono">{v.placa ?? '—'}</td>
                      <td className="px-3 py-2">{v.tipoVeiculo ?? '—'}</td>
                      <td className="px-3 py-2 text-xs text-slate-600">
                        {v.empregoPrimario ?? '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-3 text-[11px] italic text-slate-500">
          Dados de identificação da viatura vêm da planilha QDV (read-only). Clique em uma linha
          para ver o detalhe completo e editar campos operacionais.
        </p>
      </section>
    </main>
  );
}

function normalizePrefixo(p: string): string {
  return p.toUpperCase().replace(/[\s_]/g, '');
}

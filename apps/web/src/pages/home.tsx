import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';

const PAPEL_LABEL: Record<string, string> = {
  admin: 'Administrador',
  fiscal: 'Fiscal de Serviço',
  chefe_equipe: 'Chefe de Equipe',
  cov: 'COV',
  motorista: 'Motorista',
  operador: 'Operador',
  socorrista: 'Socorrista',
  dro: 'DRO',
  sentinela: 'Sentinela',
  sargenteante: 'Sargenteante',
  militar: 'Militar',
};

export function HomePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [logging, setLogging] = useState(false);

  if (!user) return null;

  const handleLogout = async () => {
    setLogging(true);
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-cbmes-red px-4 py-4 text-white">
        <h1 className="text-lg font-bold">ARGUS CBMES</h1>
        <p className="text-xs opacity-90">1ª Cia / 1º BBM</p>
      </header>

      <section className="mx-auto max-w-md p-4">
        <div className="rounded border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Você está autenticado como
          </p>
          <p className="mt-1 text-lg font-semibold text-cbmes-blue">
            {user.posto} {user.nome}
          </p>
          <p className="text-sm text-slate-600">
            NF: {user.nf} · ANT: {user.ant}
          </p>

          <div className="mt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Papéis ativos
            </p>
            <ul className="mt-1 flex flex-wrap gap-2">
              {user.papeis.map((p) => (
                <li
                  key={p}
                  className="rounded-full bg-cbmes-blue/10 px-3 py-1 text-xs font-medium text-cbmes-blue"
                >
                  {PAPEL_LABEL[p] ?? p}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <nav className="mt-6">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
            Cadastros Mestre
          </p>
          <ul className="grid grid-cols-2 gap-3">
            <li>
              <Link
                to="/cadastros/efetivo"
                className="block rounded border border-slate-200 bg-white p-4 text-center text-sm font-medium text-cbmes-blue shadow-sm transition hover:border-cbmes-blue hover:bg-cbmes-blue/5"
              >
                <span className="block text-2xl">👥</span>
                Efetivo
              </Link>
            </li>
            <li>
              <Link
                to="/cadastros/viaturas"
                className="block rounded border border-slate-200 bg-white p-4 text-center text-sm font-medium text-cbmes-blue shadow-sm transition hover:border-cbmes-blue hover:bg-cbmes-blue/5"
              >
                <span className="block text-2xl">🚒</span>
                Viaturas
              </Link>
            </li>
            <li>
              <Link
                to="/cadastros/fiscais"
                className="block rounded border border-slate-200 bg-white p-4 text-center text-sm font-medium text-cbmes-blue shadow-sm transition hover:border-cbmes-blue hover:bg-cbmes-blue/5"
              >
                <span className="block text-2xl">⭐</span>
                Fiscais
              </Link>
            </li>
            <li>
              <Link
                to="/cadastros/ideo"
                className="block rounded border border-slate-200 bg-white p-4 text-center text-sm font-medium text-cbmes-blue shadow-sm transition hover:border-cbmes-blue hover:bg-cbmes-blue/5"
              >
                <span className="block text-2xl">📋</span>
                IDEO
              </Link>
            </li>
          </ul>
        </nav>

        <div className="mt-6 rounded border border-slate-200 bg-white p-4 text-xs text-slate-500">
          <p className="font-medium text-slate-700">Sprint atual: S2 — Cadastros Mestre</p>
          <p className="mt-1">
            Próximos sprints adicionam Prévia (S4), Serviço (S5), Conferências (S6-S8), Mapa Força
            (S9) e Parte Diária (S10-S11).
          </p>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          disabled={logging}
          className="mt-6 w-full rounded-button border border-slate-300 bg-white py-3 text-base font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
        >
          {logging ? 'Encerrando…' : 'Sair'}
        </button>
      </section>
    </main>
  );
}

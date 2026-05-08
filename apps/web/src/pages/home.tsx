import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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

        <div className="mt-6 rounded border border-slate-200 bg-white p-4 text-sm text-slate-600">
          <p className="font-medium text-slate-700">Sprint S1 — Auth + RBAC</p>
          <p className="mt-1">
            Esta é a tela home placeholder. Os módulos operacionais (Cadastros, Prévia, Serviço,
            Conferências, Mapa Força, Parte Diária) chegam a partir do Sprint S2.
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

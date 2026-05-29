import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, api, type PersonaSummary } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

/**
 * Persona Picker — bypass temporário de autenticação para homologação.
 *
 * Renderizado em `/login` quando `VITE_USE_PERSONA_PICKER=true`. Lista
 * todas as personas mock e permite "logar" como qualquer uma com um
 * clique. Backend precisa estar com `ARGUS_PERSONA_PICKER=true`.
 *
 * Quando as flags estão `false`, o `<LoginPage>` real é renderizado.
 */
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
  almoxarife: 'Almoxarife',
  militar: 'Militar',
  oficial_operacoes: 'Oficial de Operações',
};

const PAPEL_BADGE: Record<string, string> = {
  admin: 'bg-cbmes-red/15 text-cbmes-red',
  fiscal: 'bg-cbmes-blue/15 text-cbmes-blue',
  chefe_equipe: 'bg-amber-500/15 text-amber-800',
  sargenteante: 'bg-emerald-500/15 text-emerald-800',
  motorista: 'bg-orange-500/15 text-orange-800',
  almoxarife: 'bg-teal-500/15 text-teal-800',
  cov: 'bg-violet-500/15 text-violet-800',
  operador: 'bg-sky-500/15 text-sky-800',
  socorrista: 'bg-pink-500/15 text-pink-800',
  dro: 'bg-slate-500/15 text-slate-700',
  sentinela: 'bg-slate-500/15 text-slate-700',
  militar: 'bg-slate-300/40 text-slate-600',
};

export function PersonaPickerPage() {
  const { loginAsPersona } = useAuth();
  const navigate = useNavigate();
  const [personas, setPersonas] = useState<PersonaSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submittingNf, setSubmittingNf] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .listPersonas()
      .then((list) => {
        if (cancelled) return;
        setPersonas(list);
      })
      .catch((e) => {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 404) {
          setError(
            'Backend não está em modo persona-picker. Verifique se ARGUS_PERSONA_PICKER=true no .env do apps/api.',
          );
        } else {
          setError(e instanceof ApiError ? e.message : 'Erro ao listar personas');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const escolher = async (nf: string) => {
    setSubmittingNf(nf);
    setError(null);
    try {
      await loginAsPersona(nf);
      navigate('/', { replace: true });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Erro ao logar como persona');
    } finally {
      setSubmittingNf(null);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-md">
        <header className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-cbmes-red">ARGUS CBMES</h1>
          <p className="mt-1 text-sm font-medium text-cbmes-blue">1ª Cia / 1º BBM</p>
        </header>

        <div className="mb-4 rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
          ⚠ <strong>Modo homologação ativo.</strong> Selecione um perfil de teste para entrar sem
          senha. A autenticação real está bypassada via env flag.
        </div>

        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-600">
          Selecione um perfil de teste
        </h2>

        {loading && <p className="text-sm text-slate-500">Carregando personas…</p>}

        {error && (
          <div
            role="alert"
            className="mb-4 rounded border border-feedback-error/30 bg-feedback-error/10 p-3 text-sm text-feedback-error"
          >
            {error}
          </div>
        )}

        <ul className="space-y-2">
          {personas.map((p) => {
            const isSubmitting = submittingNf === p.nf;
            return (
              <li key={p.nf}>
                <button
                  type="button"
                  onClick={() => escolher(p.nf)}
                  disabled={submittingNf !== null}
                  className="flex w-full flex-col gap-1 rounded border border-slate-300 bg-white p-3 text-left shadow-sm transition hover:border-cbmes-blue hover:shadow disabled:opacity-50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-base font-semibold text-slate-800">
                      {p.posto} {p.nome}
                    </span>
                    <span className="text-xs text-slate-500">NF {p.nf}</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {p.papeis.map((papel) => (
                      <span
                        key={papel}
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${PAPEL_BADGE[papel] ?? 'bg-slate-200 text-slate-700'}`}
                      >
                        {PAPEL_LABEL[papel] ?? papel}
                      </span>
                    ))}
                  </div>
                  {isSubmitting && (
                    <p className="mt-1 text-xs text-cbmes-blue">Entrando como {p.nome}…</p>
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        <p className="mt-8 text-center text-xs text-slate-400">
          Modo homologação · desativar com VITE_USE_PERSONA_PICKER=false + reiniciar Vite
        </p>
      </div>
    </main>
  );
}

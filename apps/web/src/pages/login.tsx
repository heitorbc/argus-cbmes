import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { loginInputSchema, type LoginInput } from '@argus/shared-types';
import { useAuth } from '@/lib/auth-context';
import { ApiError } from '@/lib/api';
import { StatusBar } from '@/components/StatusBar';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginInputSchema),
    defaultValues: { nf: '', senha: '' },
  });

  const onSubmit = handleSubmit(async (data) => {
    setServerError(null);
    setSubmitting(true);
    try {
      const user = await login(data.nf, data.senha);
      const next = (location.state as { from?: string } | null)?.from ?? '/';
      if (user.primeiroAcesso) {
        // Transporta a senha digitada para pré-preencher "Senha atual" na
        // troca obrigatória (location.state vive em memória, não persiste em
        // URL nem em history serializado).
        navigate('/trocar-senha', { replace: true, state: { senhaAtual: data.senha } });
      } else {
        navigate(next, { replace: true });
      }
    } catch (e) {
      if (e instanceof ApiError) {
        setServerError(e.message);
      } else {
        setServerError('Erro ao fazer login. Tente novamente.');
      }
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-white px-6 py-8">
      <div className="w-full max-w-sm">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-cbmes-red">ARGUS CBMES</h1>
          <p className="mt-1 text-sm font-medium text-cbmes-blue">1ª Cia / 1º BBM</p>
        </header>

        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <div>
            <label htmlFor="nf" className="mb-1 block text-sm font-medium text-slate-700">
              NF (número funcional)
            </label>
            <input
              id="nf"
              type="text"
              inputMode="numeric"
              autoComplete="username"
              {...register('nf')}
              className="w-full rounded border border-slate-300 px-3 py-3 text-base focus:border-cbmes-blue focus:outline-none focus:ring-2 focus:ring-cbmes-blue/30"
              placeholder="3037509"
              aria-invalid={errors.nf ? 'true' : 'false'}
            />
            {errors.nf && (
              <p role="alert" className="mt-1 text-sm text-feedback-error">
                {errors.nf.message}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="senha" className="mb-1 block text-sm font-medium text-slate-700">
              Senha
            </label>
            <input
              id="senha"
              type="password"
              autoComplete="current-password"
              {...register('senha')}
              className="w-full rounded border border-slate-300 px-3 py-3 text-base focus:border-cbmes-blue focus:outline-none focus:ring-2 focus:ring-cbmes-blue/30"
              aria-invalid={errors.senha ? 'true' : 'false'}
            />
            {errors.senha && (
              <p role="alert" className="mt-1 text-sm text-feedback-error">
                {errors.senha.message}
              </p>
            )}
          </div>

          {serverError && (
            <div
              role="alert"
              className="rounded border border-feedback-error/30 bg-feedback-error/10 p-3 text-sm text-feedback-error"
            >
              {serverError}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-button bg-cbmes-red py-3 text-base font-semibold text-white transition hover:bg-cbmes-red/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Entrando…' : 'Entrar'}
          </button>

          <div className="text-center">
            <Link
              to={`/esqueci-a-senha${getValues('nf') ? `?nf=${getValues('nf')}` : ''}`}
              className="text-sm text-cbmes-blue hover:underline"
            >
              Esqueci a senha
            </Link>
          </div>
        </form>

        <div className="mt-6">
          <StatusBar />
        </div>
      </div>
    </main>
  );
}

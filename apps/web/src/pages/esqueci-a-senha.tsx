import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { forgotPasswordInputSchema, type ForgotPasswordInput } from '@argus/shared-types';
import { ApiError, api } from '@/lib/api';
import { StatusBar } from '@/components/StatusBar';

/**
 * S2.10.4 — Página de "Esqueci a senha".
 *
 * Fluxo: usuário digita NF → backend busca email cadastrado → Supabase Auth
 * envia magic link → redireciona pra `/reset-password` com `access_token`.
 *
 * Se NF não tem email cadastrado, o backend retorna 400 explícito ("Contate
 * o administrador"). Não fazemos a tela "Email enviado" disfarçada para esse
 * caso — admin precisa intervir.
 */
export function EsqueciASenhaPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const nfInicial = params.get('nf') ?? '';

  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordInputSchema),
    defaultValues: { nf: nfInicial },
  });

  const onSubmit = handleSubmit(async (data) => {
    setServerError(null);
    setSubmitting(true);
    try {
      await api.forgotPassword(data.nf);
      setSent(true);
    } catch (e) {
      if (e instanceof ApiError) setServerError(e.message);
      else setServerError('Erro ao solicitar recuperação. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  });

  if (sent) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-white px-6 py-8">
        <div className="w-full max-w-sm text-center">
          <header className="mb-4">
            <h1 className="text-2xl font-bold text-cbmes-blue">E-mail enviado</h1>
          </header>
          <p className="text-sm text-slate-600">
            Se houver um e-mail cadastrado para essa NF, você receberá um link para redefinir a
            senha em alguns minutos. Verifique também a caixa de spam.
          </p>
          <button
            type="button"
            onClick={() => navigate('/login', { replace: true })}
            className="mt-6 w-full rounded-button bg-cbmes-blue py-3 text-base font-semibold text-white"
          >
            Voltar ao login
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-white px-6 py-8">
      <div className="w-full max-w-sm">
        <header className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-cbmes-blue">Recuperar senha</h1>
          <p className="mt-1 text-sm text-slate-600">
            Informe seu NF — enviaremos um link para o e-mail cadastrado.
          </p>
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
              aria-invalid={errors.nf ? 'true' : 'false'}
            />
            {errors.nf && (
              <p role="alert" className="mt-1 text-sm text-feedback-error">
                {errors.nf.message}
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
            className="w-full rounded-button bg-cbmes-blue py-3 text-base font-semibold text-white transition hover:bg-cbmes-blue/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Enviando…' : 'Enviar link de recuperação'}
          </button>

          <div className="text-center">
            <Link to="/login" className="text-sm text-cbmes-blue hover:underline">
              Voltar ao login
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

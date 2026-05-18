import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { senhaForteSchema } from '@argus/shared-types';
import { ApiError, api, setSessionToken } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { PasswordInput } from '@/components/PasswordInput';

const resetSchema = z
  .object({
    novaSenha: senhaForteSchema,
    confirmacao: z.string(),
  })
  .refine((d) => d.novaSenha === d.confirmacao, {
    message: 'Confirmação não confere',
    path: ['confirmacao'],
  });

type ResetForm = z.infer<typeof resetSchema>;

/**
 * S2.10.4 — Página de reset de senha (callback do magic link Supabase).
 *
 * O Supabase Auth redireciona o usuário para esta página com o token no
 * fragment da URL (`#access_token=...`). Captamos via window.location.hash,
 * pedimos a nova senha e enviamos ao backend que valida o token + troca o
 * senhaHash do User correspondente ao email do token.
 */
export function ResetPasswordPage() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // Supabase passa o token no fragment (#access_token=...) — não na query.
    // Limpa o hash após capturar para não vazar em logs/screenshots.
    const hash = window.location.hash.replace(/^#/, '');
    const params = new URLSearchParams(hash);
    const token = params.get('access_token');
    if (token) {
      setAccessToken(token);
      window.history.replaceState({}, document.title, window.location.pathname);
    } else {
      setTokenError(
        'Link de recuperação inválido ou expirado. Solicite novamente em "Esqueci a senha".',
      );
    }
  }, []);

  const {
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<ResetForm>({
    resolver: zodResolver(resetSchema),
    defaultValues: { novaSenha: '', confirmacao: '' },
  });

  const onSubmit = handleSubmit(async (data) => {
    if (!accessToken) return;
    setServerError(null);
    setSubmitting(true);
    try {
      const result = await api.resetPassword(accessToken, data.novaSenha);
      if (result.token) setSessionToken(result.token);
      setUser(result.user);
      navigate('/', { replace: true });
    } catch (e) {
      if (e instanceof ApiError) setServerError(e.message);
      else setServerError('Erro ao redefinir senha. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  });

  if (tokenError) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-white px-6 py-8">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-2xl font-bold text-feedback-error">Link inválido</h1>
          <p className="mt-3 text-sm text-slate-600">{tokenError}</p>
          <Link
            to="/esqueci-a-senha"
            className="mt-6 inline-block rounded-button bg-cbmes-blue px-6 py-3 text-sm font-semibold text-white"
          >
            Solicitar novo link
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-white px-6 py-8">
      <div className="w-full max-w-sm">
        <header className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-cbmes-blue">Definir nova senha</h1>
          <p className="mt-1 text-sm text-slate-600">Escolha uma senha forte e confirme abaixo.</p>
        </header>

        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <Controller
            name="novaSenha"
            control={control}
            render={({ field }) => (
              <PasswordInput
                label="Nova senha"
                value={field.value}
                onChange={field.onChange}
                autoComplete="new-password"
                required
                error={errors.novaSenha?.message}
              />
            )}
          />

          <Controller
            name="confirmacao"
            control={control}
            render={({ field }) => (
              <PasswordInput
                label="Confirmação"
                value={field.value}
                onChange={field.onChange}
                showCriterios={false}
                autoComplete="new-password"
                required
                error={errors.confirmacao?.message}
              />
            )}
          />

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
            disabled={submitting || !accessToken}
            className="w-full rounded-button bg-cbmes-blue py-3 text-base font-semibold text-white transition hover:bg-cbmes-blue/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Salvando…' : 'Salvar nova senha'}
          </button>
        </form>
      </div>
    </main>
  );
}

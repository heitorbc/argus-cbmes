import { useState } from 'react';
import { useForm, type UseFormRegisterReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useLocation } from 'react-router-dom';
import { changePasswordInputSchema, type ChangePasswordInput } from '@argus/shared-types';
import { useAuth } from '@/lib/auth-context';
import { ApiError, api, setSessionToken } from '@/lib/api';

export function TrocarSenhaPage() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Pré-preenche "Senha atual" com a senha digitada na tela de login
  // (transportada via location.state quando primeiroAcesso=true).
  const senhaAtualPreenchida =
    (location.state as { senhaAtual?: string } | null)?.senhaAtual ?? '';

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordInputSchema),
    defaultValues: { senhaAtual: senhaAtualPreenchida, novaSenha: '', confirmacao: '' },
  });

  const onSubmit = handleSubmit(async (data) => {
    setServerError(null);
    setSubmitting(true);
    try {
      const result = await api.changePassword(data);
      // S2.4 — backend rotaciona o token após troca de senha; atualiza
      // o storage Bearer para os próximos requests.
      if (result.token) setSessionToken(result.token);
      setUser(result.user);
      navigate('/', { replace: true });
    } catch (e) {
      if (e instanceof ApiError) {
        setServerError(e.message);
      } else {
        setServerError('Erro ao trocar senha. Tente novamente.');
      }
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-white px-6 py-8">
      <div className="w-full max-w-sm">
        <header className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-cbmes-red">Trocar senha</h1>
          {user?.primeiroAcesso && (
            <p className="mt-2 text-sm text-slate-600">
              Primeiro acesso: defina uma nova senha forte para continuar.
            </p>
          )}
        </header>

        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <Field
            id="senhaAtual"
            label="Senha atual"
            type="password"
            autoComplete="current-password"
            register={register('senhaAtual')}
            error={errors.senhaAtual?.message}
          />
          <Field
            id="novaSenha"
            label="Nova senha"
            type="password"
            autoComplete="new-password"
            hint="Mínimo 12 caracteres"
            register={register('novaSenha')}
            error={errors.novaSenha?.message}
          />
          <Field
            id="confirmacao"
            label="Confirmação da nova senha"
            type="password"
            autoComplete="new-password"
            register={register('confirmacao')}
            error={errors.confirmacao?.message}
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
            disabled={submitting}
            className="w-full rounded-button bg-cbmes-red py-3 text-base font-semibold text-white transition hover:bg-cbmes-red/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Salvando…' : 'Salvar nova senha'}
          </button>
        </form>
      </div>
    </main>
  );
}

interface FieldProps {
  id: string;
  label: string;
  type?: string;
  autoComplete?: string;
  hint?: string;
  register: UseFormRegisterReturn;
  error?: string;
}

function Field({ id, label, type = 'text', autoComplete, hint, register, error }: FieldProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={id}
        type={type}
        autoComplete={autoComplete}
        {...register}
        className="w-full rounded border border-slate-300 px-3 py-3 text-base focus:border-cbmes-blue focus:outline-none focus:ring-2 focus:ring-cbmes-blue/30"
        aria-invalid={error ? 'true' : 'false'}
      />
      {hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && (
        <p role="alert" className="mt-1 text-sm text-feedback-error">
          {error}
        </p>
      )}
    </div>
  );
}

import { forwardRef, useId, useState } from 'react';
import { senhaCriteriosAtendidos, type SenhaCriteriosAtendidos } from '@argus/shared-types';

interface PasswordInputProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  /** Mostra o checklist de critérios em tempo real (default: true). */
  showCriterios?: boolean;
  /** Desabilita o input (ex.: durante submit). */
  disabled?: boolean;
  /** Required HTML attribute (validation hint). */
  required?: boolean;
  /** Autocomplete hint para gerenciadores de senha. */
  autoComplete?: string;
  /** Mostra mensagem de erro abaixo do input. */
  error?: string;
  /** Auto-foco no mount. */
  autoFocus?: boolean;
}

/**
 * S2.10.4 — Input de senha com toggle de visibilidade (ícone olho) e
 * checklist em tempo real dos critérios da política institucional.
 *
 * Reutilizado em /trocar-senha e /reset-password.
 */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput(
    {
      value,
      onChange,
      label,
      placeholder,
      showCriterios = true,
      disabled = false,
      required = false,
      autoComplete = 'new-password',
      error,
      autoFocus = false,
    },
    ref,
  ) {
    const [visible, setVisible] = useState(false);
    const id = useId();
    const criterios: SenhaCriteriosAtendidos = senhaCriteriosAtendidos(value);

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">
            {label}
          </label>
        )}
        <div className="relative">
          <input
            ref={ref}
            id={id}
            type={visible ? 'text' : 'password'}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            required={required}
            autoComplete={autoComplete}
            autoFocus={autoFocus}
            className="w-full rounded border border-slate-300 px-3 py-2 pr-10 text-sm focus:border-cbmes-blue focus:outline-none focus:ring-1 focus:ring-cbmes-blue disabled:bg-slate-100"
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={showCriterios ? `${id}-criterios` : undefined}
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            disabled={disabled}
            aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 hover:text-cbmes-blue focus:outline-none focus:ring-1 focus:ring-cbmes-blue disabled:opacity-50"
          >
            {visible ? <EyeOpenIcon /> : <EyeClosedIcon />}
          </button>
        </div>
        {error && (
          <p role="alert" className="mt-1 text-xs text-feedback-error">
            {error}
          </p>
        )}
        {showCriterios && value.length > 0 && (
          <ul id={`${id}-criterios`} className="mt-2 space-y-1 text-xs">
            <CriterioItem ok={criterios.comprimento} text="Mínimo 8 caracteres" />
            <CriterioItem ok={criterios.letra} text="Pelo menos uma letra" />
            <CriterioItem ok={criterios.numero} text="Pelo menos um número" />
            <CriterioItem ok={criterios.especial} text="Pelo menos um caractere especial" />
          </ul>
        )}
      </div>
    );
  },
);

function CriterioItem({ ok, text }: { ok: boolean; text: string }) {
  return (
    <li
      className={
        ok
          ? 'flex items-center gap-1.5 text-emerald-700'
          : 'flex items-center gap-1.5 text-slate-500'
      }
    >
      <span aria-hidden className="inline-block w-3 text-center">
        {ok ? '✓' : '○'}
      </span>
      <span>{text}</span>
    </li>
  );
}

function EyeOpenIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeClosedIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9.88 9.88a3 3 0 0 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}

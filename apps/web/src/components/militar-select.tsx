import { useEffect, useId, useRef, useState } from 'react';
import type { Militar } from '@argus/shared-types';
import { api } from '@/lib/api';

export interface MilitarSelectProps {
  /** NF do militar selecionado (se já houver). */
  value?: string;
  /** Texto cru do militar (fallback se NF não resolvida). */
  valueRaw?: string;
  /**
   * Callback quando o usuário seleciona/limpa um militar.
   * `militar` vem completo se selecionado da lista; `null` se limpo.
   * `nf` é a NF do militar selecionado (ou `null` se limpou).
   */
  onChange: (nf: string | null, militar: Militar | null) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Limita busca à 1ª Cia (default: true). */
  somente1aCia?: boolean;
  /** NFs a excluir das opções (ex.: substituído ≠ substituto). */
  excluirNfs?: string[];
  /** ID HTML para acessibilidade. */
  id?: string;
}

const MIN_QUERY_LEN = 2;
const DEBOUNCE_MS = 300;
const PAGE_SIZE = 10;

/**
 * Combobox de seleção de militar com debounce + busca por NF/nome/posto.
 *
 * Usa `api.efetivoList({q, somente1aCia, page, pageSize})` que após o S6a-fix retorna
 * apenas militares de DADOS+1ª1º (não vaza militares só do EFETIVO geral).
 */
export function MilitarSelect({
  value,
  valueRaw,
  onChange,
  placeholder = 'Buscar por NF ou nome…',
  disabled = false,
  somente1aCia = true,
  excluirNfs = [],
  id,
}: MilitarSelectProps) {
  const reactId = useId();
  const inputId = id ?? `militar-select-${reactId}`;
  const listboxId = `${inputId}-listbox`;

  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Militar[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [resolvedLabel, setResolvedLabel] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Resolve label quando value vem de fora (montagem ou setValue externo)
  useEffect(() => {
    let cancelled = false;
    if (!value) {
      setResolvedLabel(null);
      return;
    }
    api
      .efetivoFindByNf(value)
      .then((m) => {
        if (cancelled) return;
        setResolvedLabel(formatMilitar(m));
      })
      .catch(() => {
        if (cancelled) return;
        setResolvedLabel(valueRaw ?? `NF ${value}`);
      });
    return () => {
      cancelled = true;
    };
  }, [value, valueRaw]);

  // Debounced search
  useEffect(() => {
    const q = search.trim();
    if (q.length < MIN_QUERY_LEN) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(() => {
      let cancelled = false;
      api
        .efetivoList({ q, somente1aCia, page: 1, pageSize: PAGE_SIZE })
        .then((r) => {
          if (cancelled) return;
          const filtered = r.items.filter((m) => !excluirNfs.includes(m.nf));
          setResults(filtered);
          setHighlight(0);
        })
        .catch(() => {
          if (cancelled) return;
          setResults([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search, somente1aCia, excluirNfs]);

  // Click outside fecha
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  function pick(m: Militar) {
    onChange(m.nf, m);
    setResolvedLabel(formatMilitar(m));
    setSearch('');
    setOpen(false);
    inputRef.current?.blur();
  }

  function clear() {
    onChange(null, null);
    setResolvedLabel(null);
    setSearch('');
    setOpen(false);
    inputRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setOpen(false);
      e.currentTarget.blur();
      return;
    }
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setOpen(true);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter' && results[highlight]) {
      e.preventDefault();
      pick(results[highlight]);
    }
  }

  // Quando há militar selecionado, mostra chip com botão Limpar
  if (value && resolvedLabel) {
    return (
      <div
        ref={containerRef}
        className="flex items-center justify-between rounded border border-slate-300 bg-slate-50 px-2 py-2 text-sm"
      >
        <span className="truncate">{resolvedLabel}</span>
        {!disabled && (
          <button
            type="button"
            onClick={clear}
            className="ml-2 shrink-0 rounded px-2 py-1 text-xs text-feedback-error hover:bg-feedback-error/10"
            aria-label="Limpar seleção"
          >
            Limpar
          </button>
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        ref={inputRef}
        id={inputId}
        type="text"
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls={listboxId}
        aria-activedescendant={open && results[highlight] ? `${listboxId}-${highlight}` : undefined}
        aria-autocomplete="list"
        autoComplete="off"
        disabled={disabled}
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="w-full rounded border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
      />
      {open && search.trim().length >= MIN_QUERY_LEN && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded border border-slate-200 bg-white shadow-lg"
        >
          {loading && (
            <li className="px-3 py-2 text-xs text-slate-500" aria-live="polite">
              Buscando…
            </li>
          )}
          {!loading && results.length === 0 && (
            <li className="px-3 py-2 text-xs text-slate-500">Nenhum militar encontrado.</li>
          )}
          {results.map((m, i) => (
            <li
              key={m.nf}
              id={`${listboxId}-${i}`}
              role="option"
              aria-selected={i === highlight}
              className={`cursor-pointer px-3 py-2 text-sm ${i === highlight ? 'bg-cbmes-blue/10' : 'hover:bg-slate-50'}`}
              onMouseDown={(e) => {
                e.preventDefault(); // mantém foco no input
                pick(m);
              }}
              onMouseEnter={() => setHighlight(i)}
            >
              <strong>{m.posto}</strong> {m.nomeGuerra ?? m.nome.split(' ')[0]}{' '}
              <span className="text-xs text-slate-500">
                · NF {m.nf} · ANT {m.ant}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatMilitar(m: Militar): string {
  const nomeCurto = m.nomeGuerra ?? m.nome.split(' ')[0];
  return `${m.posto} ${nomeCurto} (NF ${m.nf})`;
}

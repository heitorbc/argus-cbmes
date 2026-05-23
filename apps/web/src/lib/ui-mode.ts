import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

/**
 * S2.10.12 — Modo de visualização escolhido pelo usuário pós-login.
 *
 * - `mobile`: experiência original mobile-first (max-w-md, header simples,
 *   modais empilhados). Permanece intacta — uso em campo/plantão.
 * - `web`: experiência desktop dual-screen (sidebar fixa, tabelas largas,
 *   master-detail, atalhos teclado, animações). Para gestão diária
 *   (sargenteante, oficial de operações, comandante, logística).
 *
 * Default = undefined na 1ª visita → router força redirect /escolher-modo.
 * Persiste em localStorage; sincroniza entre tabs via storage event.
 */
export type UIMode = 'mobile' | 'web';

const STORAGE_KEY = 'ARGUS_UI_MODE';
const VIEWPORT_BREAKPOINT_WEB = 1024;

/** Sugere modo baseado na viewport atual (ressaltado no picker). */
export function suggestedMode(): UIMode {
  if (typeof window === 'undefined') return 'mobile';
  return window.innerWidth >= VIEWPORT_BREAKPOINT_WEB ? 'web' : 'mobile';
}

function readStored(): UIMode | undefined {
  if (typeof window === 'undefined') return undefined;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw === 'mobile' || raw === 'web' ? raw : undefined;
}

interface UIModeContextValue {
  /** undefined = usuário ainda não escolheu nesta sessão/dispositivo. */
  mode: UIMode | undefined;
  /** Sugestão para destacar no picker (não persistida automaticamente). */
  suggested: UIMode;
  /** True se o usuário já fez uma escolha persistida. */
  hasChosen: boolean;
  /** True se mode === 'web'. False também quando undefined. */
  isWeb: boolean;
  /** True se mode === 'mobile'. False também quando undefined. */
  isMobile: boolean;
  /** Persiste a escolha em localStorage e atualiza o context. */
  setMode: (mode: UIMode) => void;
  /** Limpa a escolha (força ver o picker novamente). */
  clearMode: () => void;
}

const UIModeContext = createContext<UIModeContextValue | null>(null);

export function UIModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<UIMode | undefined>(() => readStored());
  const [suggested, setSuggested] = useState<UIMode>(() => suggestedMode());

  // Re-detecta sugestão quando a janela redimensiona (relevante se o
  // usuário rotaciona tablet ou conecta monitor externo antes de escolher).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = () => setSuggested(suggestedMode());
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // Sincroniza entre tabs do mesmo navegador (storage event).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      const next = e.newValue;
      setModeState(next === 'mobile' || next === 'web' ? next : undefined);
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  const setMode = useCallback((next: UIMode) => {
    window.localStorage.setItem(STORAGE_KEY, next);
    setModeState(next);
  }, []);

  const clearMode = useCallback(() => {
    window.localStorage.removeItem(STORAGE_KEY);
    setModeState(undefined);
  }, []);

  const value = useMemo<UIModeContextValue>(
    () => ({
      mode,
      suggested,
      hasChosen: mode !== undefined,
      isWeb: mode === 'web',
      isMobile: mode === 'mobile',
      setMode,
      clearMode,
    }),
    [mode, suggested, setMode, clearMode],
  );

  return createElement(UIModeContext.Provider, { value }, children);
}

export function useUIMode(): UIModeContextValue {
  const ctx = useContext(UIModeContext);
  if (!ctx) throw new Error('useUIMode deve ser usado dentro de <UIModeProvider>');
  return ctx;
}

/** Para testes — expõe a chave de storage usada. */
export const UI_MODE_STORAGE_KEY = STORAGE_KEY;

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { UserSession } from '@argus/shared-types';
import { ApiError, api, setSessionToken } from './api';

interface AuthContextValue {
  user: UserSession | null;
  loading: boolean;
  login: (nf: string, senha: string) => Promise<UserSession>;
  /** Bypass de homologação — só funciona se o backend tiver `ARGUS_PERSONA_PICKER=true`. */
  loginAsPersona: (nf: string) => Promise<UserSession>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  setUser: (user: UserSession | null) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const me = await api.me();
      setUser(me);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setUser(null);
      } else {
        // Se backend está fora, tratamos como deslogado mas sem ruído
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (nf: string, senha: string) => {
    const result = await api.login({ nf, senha });
    // S2.4 — persiste token Bearer (fallback ao cookie httpOnly).
    if (result.token) setSessionToken(result.token);
    setUser(result.user);
    return result.user;
  }, []);

  const loginAsPersona = useCallback(async (nf: string) => {
    const result = await api.personaLogin(nf);
    if (result.token) setSessionToken(result.token);
    setUser(result.user);
    return result.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setSessionToken(null);
      setUser(null);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, login, loginAsPersona, logout, refresh, setUser }),
    [user, loading, login, loginAsPersona, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>');
  return ctx;
}

import { QueryClient } from '@tanstack/react-query';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';

/**
 * S2.10.9c — QueryClient compartilhado pelo app inteiro.
 *
 * Defaults conservadores: queries ficam "fresh" por 5min por padrão (override
 * por chamada via `staleTime: ...` em cada `useQuery`). `gcTime` 24h garante
 * que dados restaurados do localStorage sigam disponíveis durante o dia.
 *
 * `refetchOnWindowFocus: false` evita refetch barulhento ao voltar de outra
 * aba — o sistema mostra dados de planilhas que mudam raramente; refetch
 * deliberado vem do botão "↻ Atualizar" ou navegação.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5min
      gcTime: 24 * 60 * 60 * 1000, // 24h
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

/**
 * S2.10.9c — Persister para hidratar o cache a partir do localStorage no
 * carregamento do app. Resulta em navegação instantânea após a 1ª visita
 * (offline-first lite).
 *
 * Chave usada no localStorage: `ARGUS_QUERY_CACHE_v1`. Versão `v1` permite
 * invalidar todo o cache local em deploys que mudam o shape dos dados
 * (basta bumpar para `_v2`).
 */
export const queryPersister = createSyncStoragePersister({
  storage: typeof window === 'undefined' ? undefined : window.localStorage,
  key: 'ARGUS_QUERY_CACHE_v1',
  throttleTime: 1000,
});

import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { AppRouter } from './router';
import { queryClient, queryPersister } from './lib/query-client';

/**
 * S2.10.9c — Wrappa o app com `PersistQueryClientProvider` para hidratar o
 * cache do React Query a partir do localStorage. Navegação entre páginas
 * que já foram visitadas vira instantânea (UI volta de cache; refetch em
 * background atualiza).
 */
export function App() {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister: queryPersister, maxAge: 24 * 60 * 60 * 1000 }}
    >
      <AppRouter />
    </PersistQueryClientProvider>
  );
}

import {
  Navigate,
  Outlet,
  RouterProvider,
  createBrowserRouter,
  useLocation,
} from 'react-router-dom';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { canAccessRoute } from '@/lib/permissions';
import { LoginPage } from '@/pages/login';
import { PersonaPickerPage } from '@/pages/persona-picker';
import { TrocarSenhaPage } from '@/pages/trocar-senha';
import { HomePage } from '@/pages/home';
import { EfetivoPage } from '@/pages/efetivo';
import { EfetivoDetalhePage } from '@/pages/efetivo-detalhe';
import { ViaturasPage } from '@/pages/viaturas';
import { ViaturasDetalhePage } from '@/pages/viaturas-detalhe';
import { EscalasPage } from '@/pages/escalas';
import { EscalasEspeciaisPage } from '@/pages/escalas-especiais';
import { FiscaisPage } from '@/pages/fiscais';
import { IdeoPage } from '@/pages/ideo';
import { PreviaPage } from '@/pages/previa';
import { RecursosPage } from '@/pages/recursos';
import { UnidadesPage } from '@/pages/unidades';
import { AtestadosPage } from '@/pages/atestados';
import { ConferenciaEquipePage } from '@/pages/conferencia-equipe';
import { ConferenciaViaturaPage } from '@/pages/conferencia-viatura';
import { DispensasPage } from '@/pages/dispensas';
import { FeriasPage } from '@/pages/ferias';
import { IntegracoesPage } from '@/pages/integracoes';
import { TrocasPage } from '@/pages/trocas';
import { NotasServicoPage } from '@/pages/notas-servico';
import { ParteDiariaPage } from '@/pages/parte-diaria';
import { ServicoIdeoPage } from '@/pages/servico-ideo';

function FullScreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white">
      <p className="text-sm text-slate-500">Carregando…</p>
    </div>
  );
}

function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <FullScreenLoader />;

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  // Força troca de senha no primeiro acesso, exceto se já estiver na tela de troca
  if (user.primeiroAcesso && location.pathname !== '/trocar-senha') {
    return <Navigate to="/trocar-senha" replace />;
  }

  // S6f — RBAC por seção: redireciona para `/` se a rota for de seção não permitida.
  if (!canAccessRoute(user.papeis, location.pathname)) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}

function PublicOnlyRoute() {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (user && !user.primeiroAcesso) {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}

function RootLayout() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}

/**
 * Persona picker (homologação) — quando `VITE_USE_PERSONA_PICKER=true`, a
 * rota `/login` mostra o seletor de personas em vez do form NF+senha.
 * Backend precisa estar com `ARGUS_PERSONA_PICKER=true` para o endpoint
 * `/auth/dev/personas` responder; caso contrário o picker mostra erro.
 */
const LoginEntryPoint =
  import.meta.env.VITE_USE_PERSONA_PICKER === 'true' ? PersonaPickerPage : LoginPage;

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      {
        element: <PublicOnlyRoute />,
        children: [{ path: '/login', element: <LoginEntryPoint /> }],
      },
      {
        element: <ProtectedRoute />,
        children: [
          { path: '/', element: <HomePage /> },
          { path: '/trocar-senha', element: <TrocarSenhaPage /> },
          { path: '/cadastros/efetivo', element: <EfetivoPage /> },
          { path: '/cadastros/efetivo/:nf', element: <EfetivoDetalhePage /> },
          { path: '/cadastros/viaturas', element: <ViaturasPage /> },
          { path: '/cadastros/viaturas/:prefixo', element: <ViaturasDetalhePage /> },
          { path: '/cadastros/fiscais', element: <FiscaisPage /> },
          { path: '/cadastros/ideo', element: <IdeoPage /> },
          { path: '/cadastros/escalas', element: <EscalasPage /> },
          { path: '/cadastros/escalas-especiais', element: <EscalasEspeciaisPage /> },
          { path: '/cadastros/dispensas', element: <DispensasPage /> },
          { path: '/cadastros/ferias', element: <FeriasPage /> },
          { path: '/cadastros/trocas', element: <TrocasPage /> },
          { path: '/cadastros/atestados', element: <AtestadosPage /> },
          { path: '/cadastros/notas-servico', element: <NotasServicoPage /> },
          { path: '/configuracoes/unidades', element: <UnidadesPage /> },
          { path: '/configuracoes/recursos', element: <RecursosPage /> },
          { path: '/configuracoes/integracoes', element: <IntegracoesPage /> },
          { path: '/previa', element: <PreviaPage /> },
          { path: '/parte-diaria', element: <ParteDiariaPage /> },
          { path: '/servico/:data/conferencia-equipe', element: <ConferenciaEquipePage /> },
          {
            path: '/servico/:data/conferencia-viatura/:vtrPrefixo',
            element: <ConferenciaViaturaPage />,
          },
          { path: '/servico/:data/ideo', element: <ServicoIdeoPage /> },
        ],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}

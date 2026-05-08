import {
  Navigate,
  Outlet,
  RouterProvider,
  createBrowserRouter,
  useLocation,
} from 'react-router-dom';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { LoginPage } from '@/pages/login';
import { TrocarSenhaPage } from '@/pages/trocar-senha';
import { HomePage } from '@/pages/home';
import { EfetivoPage } from '@/pages/efetivo';
import { ViaturasPage } from '@/pages/viaturas';

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

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      {
        element: <PublicOnlyRoute />,
        children: [{ path: '/login', element: <LoginPage /> }],
      },
      {
        element: <ProtectedRoute />,
        children: [
          { path: '/', element: <HomePage /> },
          { path: '/trocar-senha', element: <TrocarSenhaPage /> },
          { path: '/cadastros/efetivo', element: <EfetivoPage /> },
          { path: '/cadastros/viaturas', element: <ViaturasPage /> },
        ],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}

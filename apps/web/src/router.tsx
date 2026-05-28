import {
  Navigate,
  Outlet,
  RouterProvider,
  createBrowserRouter,
  useLocation,
} from 'react-router-dom';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { canAccessRoute } from '@/lib/permissions';
import { Footer } from '@/components/Footer';
import { LoginPage } from '@/pages/login';
import { EsqueciASenhaPage } from '@/pages/esqueci-a-senha';
import { ResetPasswordPage } from '@/pages/reset-password';
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
import { MapaForcaPage } from '@/pages/mapa-forca';
import { MapaForcaDetalhePage } from '@/pages/mapa-forca-detalhe';
import { RecursosPage } from '@/pages/recursos';
import { UnidadesPage } from '@/pages/unidades';
import { UsuariosPage } from '@/pages/usuarios';
import { AtestadosPage } from '@/pages/atestados';
import { ChefesOperacoesPage } from '@/pages/chefes-operacoes';
import { CompartimentosMateriaisPage } from '@/pages/compartimentos-materiais';
import { ConferenciaEquipePage } from '@/pages/conferencia-equipe';
import { ConferenciaMateriaisPage } from '@/pages/conferencia-materiais';
import { ConferenciaViaturaPage } from '@/pages/conferencia-viatura';
import { DispensasPage } from '@/pages/dispensas';
import { FeriasPage } from '@/pages/ferias';
import { IntegracoesPage } from '@/pages/integracoes';
import { AgendaPage } from '@/pages/agenda';
import { IseoHospitaisPage } from '@/pages/iseo-hospitais';
import { LocaisFaxinaPage } from '@/pages/locais-faxina';
import { TrocasPage } from '@/pages/trocas';
import { NotasServicoPage } from '@/pages/notas-servico';
import { ParteDiariaPage } from '@/pages/parte-diaria';
import { ServicoIdeoPage } from '@/pages/servico-ideo';
import { LoadingScreen } from '@/components/LoadingScreen';

/**
 * S2.5 — substituído por `LoadingScreen` (animado + escalação por tempo
 * para cobrir cold start do backend Render free tier).
 */
function FullScreenLoader() {
  return <LoadingScreen />;
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

  // S2.10.13a — Footer global com status (3 dots: API/Mapa Força/Supabase).
  // Renderizado pós-login em TODAS as páginas protegidas. Layout `pb-10`
  // no body garante que o conteúdo da página não fica escondido atrás
  // do rodapé fixo.
  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex-1 pb-10">
        <Outlet />
      </div>
      <Footer />
    </div>
  );
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
        children: [
          { path: '/login', element: <LoginEntryPoint /> },
          { path: '/esqueci-a-senha', element: <EsqueciASenhaPage /> },
          { path: '/reset-password', element: <ResetPasswordPage /> },
        ],
      },
      {
        element: <ProtectedRoute />,
        children: [
          { path: '/', element: <HomePage /> },
          { path: '/agenda', element: <AgendaPage /> },
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
          { path: '/cadastros/iseo-hospitais', element: <IseoHospitaisPage /> },
          { path: '/cadastros/chefes-operacoes', element: <ChefesOperacoesPage /> },
          { path: '/cadastros/atestados', element: <AtestadosPage /> },
          { path: '/cadastros/notas-servico', element: <NotasServicoPage /> },
          { path: '/cadastros/locais-faxina', element: <LocaisFaxinaPage /> },
          { path: '/configuracoes/unidades', element: <UnidadesPage /> },
          { path: '/configuracoes/usuarios', element: <UsuariosPage /> },
          { path: '/configuracoes/recursos', element: <RecursosPage /> },
          { path: '/configuracoes/integracoes', element: <IntegracoesPage /> },
          {
            path: '/configuracoes/compartimentos-materiais',
            element: <CompartimentosMateriaisPage />,
          },
          { path: '/conferencia-materiais', element: <ConferenciaMateriaisPage /> },
          { path: '/mapa-forca', element: <MapaForcaPage /> },
          { path: '/mapa-forca/:data', element: <MapaForcaDetalhePage /> },
          // Redirect curto para bookmarks antigos (S0.x/rename-mapa-forca).
          { path: '/previa', element: <Navigate to="/mapa-forca" replace /> },
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

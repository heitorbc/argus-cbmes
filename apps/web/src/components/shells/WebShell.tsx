import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { formatDisplayName } from '@argus/shared-types';
import { useAuth } from '@/lib/auth-context';
import { canAccessRoute, canSeeSection } from '@/lib/permissions';
import { ModeToggleButton } from '@/components/ModeToggleButton';

/**
 * S2.10.12 — Shell para o modo WEB (desktop dual-screen).
 *
 * Layout 3-zonas (CSS Grid):
 *   - Sidebar esquerda (240px expandida / 64px recolhida) com navegação
 *     agrupada por módulo. Background `cbmes-blue-dark`, texto branco.
 *   - Topbar (56px) com breadcrumb + user-chip + ModeToggleButton.
 *   - Main (flex-1, scroll vertical, sem max-width).
 *
 * Estado collapsed persistido em localStorage. Sidebar auto-collapse em
 * viewport <1280px (preserva área útil em monitores menores).
 *
 * Páginas que ainda não têm versão WEB renderizam a versão mobile dentro
 * deste shell (fallback graceful — o router.tsx decide qual elemento
 * passar para o Outlet).
 */

const SIDEBAR_COLLAPSED_KEY = 'ARGUS_WEB_SIDEBAR_COLLAPSED';
const AUTO_COLLAPSE_BREAKPOINT = 1280;

interface NavItem {
  to: string;
  label: string;
  icon: string;
}

interface NavGroup {
  id: 'operacional' | 'sargenteacao' | 'cadastros' | 'logistica' | 'configuracoes';
  label: string;
  /** Para gating por papel (`canSeeSection`). undefined = sempre visível. */
  section?: 'sargenteacao' | 'logistica' | 'configuracoes';
  items: NavItem[];
}

const NAV: NavGroup[] = [
  {
    id: 'operacional',
    label: 'Operacional',
    items: [
      { to: '/', label: 'Home', icon: '🏠' },
      { to: '/mapa-forca', label: 'Mapa Força', icon: '🗺️' },
      { to: '/agenda', label: 'Minha Agenda', icon: '📅' },
      { to: '/parte-diaria', label: 'Parte Diária', icon: '📄' },
    ],
  },
  {
    id: 'sargenteacao',
    label: 'Sargenteação',
    section: 'sargenteacao',
    items: [
      { to: '/cadastros/escalas', label: 'Escalas', icon: '📋' },
      { to: '/cadastros/escalas-especiais', label: 'Escalas Especiais', icon: '🎯' },
      { to: '/cadastros/dispensas', label: 'Dispensas', icon: '🏥' },
      { to: '/cadastros/atestados', label: 'Atestados', icon: '🩺' },
      { to: '/cadastros/trocas', label: 'Trocas', icon: '🔄' },
      { to: '/cadastros/notas-servico', label: 'Notas de Serviço', icon: '📑' },
      { to: '/cadastros/ferias', label: 'Férias', icon: '🌴' },
      { to: '/cadastros/chefes-operacoes', label: 'Chefes de Operações', icon: '👮' },
    ],
  },
  {
    id: 'cadastros',
    label: 'Cadastros',
    items: [
      { to: '/cadastros/efetivo', label: 'Efetivo', icon: '👥' },
      { to: '/cadastros/viaturas', label: 'Viaturas', icon: '🚒' },
      { to: '/cadastros/fiscais', label: 'Fiscais', icon: '🎖️' },
      { to: '/cadastros/ideo', label: 'IDEO', icon: '✅' },
      { to: '/cadastros/locais-faxina', label: 'Locais de Faxina', icon: '🧹' },
    ],
  },
  {
    id: 'logistica',
    label: 'Logística',
    section: 'logistica',
    items: [
      { to: '/cadastros/iseo-hospitais', label: 'ISEO Hospitais', icon: '🏨' },
      { to: '/conferencia-materiais', label: 'Conferência de Materiais', icon: '📦' },
    ],
  },
  {
    id: 'configuracoes',
    label: 'Configurações',
    section: 'configuracoes',
    items: [
      { to: '/configuracoes/usuarios', label: 'Usuários', icon: '🔑' },
      { to: '/configuracoes/unidades', label: 'Unidades', icon: '🏛️' },
      { to: '/configuracoes/recursos', label: 'Recursos', icon: '⚙️' },
      { to: '/configuracoes/compartimentos-materiais', label: 'Compartimentos', icon: '📦' },
      { to: '/configuracoes/integracoes', label: 'Integrações', icon: '🔌' },
    ],
  },
];

export function WebShell() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const stored = window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    if (stored !== null) return stored === 'true';
    return window.innerWidth < AUTO_COLLAPSE_BREAKPOINT;
  });

  // Auto-collapse quando viewport encolhe (não desfaz uma escolha manual
  // de "expandido em telinha" — só auto-aplica no mount via stored===null).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = () => {
      if (window.innerWidth < AUTO_COLLAPSE_BREAKPOINT && !collapsed) {
        setCollapsed(true);
      }
    };
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [collapsed]);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
  };

  if (!user) return null;

  const visibleGroups = NAV.filter((g) => {
    if (g.section && !canSeeSection(user.papeis, g.section)) return false;
    return g.items.some((item) => canAccessRoute(user.papeis, item.to));
  });

  const breadcrumb = computeBreadcrumb(location.pathname);

  return (
    <div className="grid h-screen grid-rows-[56px_1fr] bg-slate-100" style={gridCols(collapsed)}>
      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <motion.aside
        className="row-span-2 flex flex-col overflow-hidden bg-cbmes-blue text-white shadow-lg"
        animate={{ width: collapsed ? 64 : 240 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
      >
        <div className="flex items-center justify-between px-3 py-3">
          <Link
            to="/"
            className="flex items-center gap-2 overflow-hidden font-bold tracking-wide"
            title="ARGUS CBMES"
          >
            <span className="text-xl">🚒</span>
            {!collapsed && <span className="whitespace-nowrap">ARGUS</span>}
          </Link>
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
            className="rounded-button p-1 text-white/80 hover:bg-white/10"
          >
            {collapsed ? '›' : '‹'}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 pb-4">
          {visibleGroups.map((group) => {
            const items = group.items.filter((it) => canAccessRoute(user.papeis, it.to));
            if (items.length === 0) return null;
            return (
              <div key={group.id} className="mt-3">
                {!collapsed && (
                  <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-white/50">
                    {group.label}
                  </p>
                )}
                <ul className="space-y-0.5">
                  {items.map((item) => (
                    <li key={item.to}>
                      <NavLinkItem
                        item={item}
                        active={isActivePath(location.pathname, item.to)}
                        collapsed={collapsed}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </nav>

        <div className="border-t border-white/10 px-2 py-2">
          <button
            type="button"
            onClick={() => void logout()}
            title="Sair"
            className="flex w-full items-center gap-2 rounded-button px-2 py-2 text-sm text-white/80 hover:bg-white/10"
          >
            <span aria-hidden>🚪</span>
            {!collapsed && <span>Sair</span>}
          </button>
        </div>
      </motion.aside>

      {/* ── Topbar ──────────────────────────────────────────────── */}
      <header className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-4">
        <div className="flex items-center gap-3 text-sm text-slate-600">
          {breadcrumb.map((b, i) => (
            <span key={i} className="flex items-center gap-2">
              {i > 0 && <span className="text-slate-300">/</span>}
              {b.to ? (
                <Link to={b.to} className="hover:text-cbmes-blue">
                  {b.label}
                </Link>
              ) : (
                <span className="font-medium text-slate-800">{b.label}</span>
              )}
            </span>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden text-right text-xs text-slate-600 sm:block">
            <p className="font-semibold text-cbmes-blue">{formatDisplayName(user)}</p>
            <p className="opacity-80">NF {user.nf}</p>
          </div>
          <ModeToggleButton variant="full" />
        </div>
      </header>

      {/* ── Main ────────────────────────────────────────────────── */}
      <main className="overflow-y-auto" id="conteudo-principal">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="h-full"
        >
          <Outlet />
        </motion.div>
      </main>
    </div>
  );
}

function gridCols(collapsed: boolean): React.CSSProperties {
  return { gridTemplateColumns: `${collapsed ? 64 : 240}px 1fr` };
}

function NavLinkItem({
  item,
  active,
  collapsed,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
}) {
  return (
    <Link
      to={item.to}
      title={collapsed ? item.label : undefined}
      className={`flex items-center gap-2 rounded-button px-2 py-2 text-sm transition ${
        active
          ? 'bg-white/15 font-semibold text-white'
          : 'text-white/80 hover:bg-white/10 hover:text-white'
      }`}
    >
      <span aria-hidden className="text-base">
        {item.icon}
      </span>
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );
}

function isActivePath(pathname: string, to: string): boolean {
  if (to === '/') return pathname === '/';
  return pathname === to || pathname.startsWith(`${to}/`);
}

interface Crumb {
  label: string;
  to?: string;
}

function computeBreadcrumb(pathname: string): Crumb[] {
  if (pathname === '/') return [{ label: 'Home' }];
  // Procura nos NAV groups por um item que casa o path
  for (const group of NAV) {
    for (const item of group.items) {
      if (item.to === '/') continue;
      if (pathname === item.to || pathname.startsWith(`${item.to}/`)) {
        return [
          { label: 'Home', to: '/' },
          { label: group.label },
          { label: item.label, to: item.to },
        ];
      }
    }
  }
  return [{ label: 'Home', to: '/' }, { label: pathname }];
}

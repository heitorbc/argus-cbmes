import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatDisplayName } from '@argus/shared-types';
import { useAuth } from '@/lib/auth-context';
import { canSeeSection } from '@/lib/permissions';
import { AgendaCard } from '@/components/AgendaCard';
import { StatusBar } from '@/components/StatusBar';

const PAPEL_LABEL: Record<string, string> = {
  admin: 'Administrador',
  fiscal: 'Fiscal de Serviço',
  chefe_equipe: 'Chefe de Equipe',
  cov: 'COV',
  motorista: 'Motorista',
  operador: 'Operador',
  socorrista: 'Socorrista',
  dro: 'DRO',
  sentinela: 'Sentinela',
  sargenteante: 'Sargenteante',
  almoxarife: 'Almoxarife',
  militar: 'Militar',
};

export function HomePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [logging, setLogging] = useState(false);

  if (!user) return null;

  // S6f — RBAC visual: Prontidão é universal, demais seções por papel.
  const showSargenteacao = canSeeSection(user.papeis, 'sargenteacao');
  const showLogistica = canSeeSection(user.papeis, 'logistica');
  const showConfiguracoes = canSeeSection(user.papeis, 'configuracoes');

  const handleLogout = async () => {
    setLogging(true);
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-cbmes-red px-4 py-4 text-white">
        <h1 className="text-lg font-bold">ARGUS CBMES</h1>
        <p className="text-xs opacity-90">1ª Cia / 1º BBM</p>
      </header>

      <section className="mx-auto max-w-md p-4">
        <div className="rounded border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Você está autenticado como
          </p>
          <p className="mt-1 text-lg font-semibold text-cbmes-blue">{formatDisplayName(user)}</p>
          {user.nome && user.nome !== formatDisplayName(user) && (
            <p className="text-xs italic text-slate-500">{user.nome}</p>
          )}
          <p className="mt-1 text-sm text-slate-600">
            NF: {user.nf} · ANT: {user.ant}
          </p>

          <div className="mt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Papéis ativos
            </p>
            <ul className="mt-1 flex flex-wrap gap-2">
              {user.papeis.map((p) => (
                <li
                  key={p}
                  className="rounded-full bg-cbmes-blue/10 px-3 py-1 text-xs font-medium text-cbmes-blue"
                >
                  {PAPEL_LABEL[p] ?? p}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* S2.10.13d — Meu Perfil: nova seção no topo, universal, com
            visão centrada no militar logado (Próxima Escala + Meus Dados
            + Minha Agenda). */}
        <ModuloSection
          titulo="Meu Perfil"
          descricao="Sua próxima escala, seus dados e sua agenda integrada."
          accent="border-l-cbmes-blue"
          destaque
        >
          <div className="col-span-full">
            <AgendaCard />
          </div>
          <CardLink to="/perfil/meus-dados" icon="👤" label="Meus Dados" />
          <CardLink to="/agenda" icon="🗓️" label="Minha Agenda" />
        </ModuloSection>

        {/* S6c/F4 — reorganização modular: Sargenteação, Prontidão, Logística */}

        <ModuloSection
          titulo="Prontidão"
          descricao="Operação do dia: Mapa Força, Conferências, Fiscais, IDEO."
          accent="border-l-cbmes-red"
          destaque
        >
          <CardLink to="/mapa-forca" icon="🗺️" label="Mapa Força" destaque />
          <CardLink to="/parte-diaria" icon="📑" label="Parte Diária" />
          <CardLink to="/cadastros/fiscais" icon="⭐" label="Fiscais (override)" />
          <CardLink to="/cadastros/ideo" icon="📋" label="IDEO" />
          <CardLink to="/conferencia-materiais" icon="📦" label="Conferência de Materiais" />
          <CardInfo
            icon="✅"
            label="Outras Conferências"
            descricao="Chefe de Equipe + COV/Motorista via Mapa Força → Iniciar Prévia → Iniciar Serviço"
          />
        </ModuloSection>

        {showSargenteacao && (
          <ModuloSection
            titulo="Sargenteação"
            descricao="Cadastros de pessoal e escalas (RH operacional)."
            accent="border-l-cbmes-blue"
          >
            <CardLink to="/cadastros/efetivo" icon="👥" label="Efetivo" />
            <CardLink to="/cadastros/escalas" icon="📅" label="Escala Mensal" />
            <CardLink to="/cadastros/escalas-especiais" icon="📆" label="Escala Especial (XLSM)" />
            <CardLink to="/cadastros/dispensas" icon="🏖️" label="Dispensas" />
            <CardLink to="/cadastros/ferias" icon="🏝️" label="Férias" />
            <CardLink to="/cadastros/trocas" icon="🔄" label="Trocas Autorizadas" />
            <CardLink to="/cadastros/atestados" icon="🏥" label="Atestados" />
            <CardLink to="/cadastros/notas-servico" icon="📋" label="Notas de Serviço" />
          </ModuloSection>
        )}

        {/* S2.10.13d — Módulo Escalas: ISEO Hospitais + Chefes de Operações
            agrupados como módulo próprio (universal). */}
        <ModuloSection
          titulo="Escalas"
          descricao="ISEO Hospitais e Chefe de Operações (escalas externas integradas)."
          accent="border-l-violet-500"
        >
          <CardLink to="/cadastros/iseo-hospitais" icon="🏥" label="ISEO Hospitais" />
          <CardLink to="/cadastros/chefes-operacoes" icon="👮" label="Chefes de Operações" />
        </ModuloSection>

        {showLogistica && (
          <ModuloSection
            titulo="Logística"
            descricao="Frota, recursos e estado do Mapa Força."
            accent="border-l-amber-500"
          >
            <CardLink to="/cadastros/viaturas" icon="🚒" label="Viaturas" />
            <CardLink to="/logistica/recursos" icon="📦" label="Recursos" />
          </ModuloSection>
        )}

        {showConfiguracoes && (
          <ModuloSection
            titulo="Configurações"
            descricao="Admin · Unidades e Integrações."
            accent="border-l-slate-600"
          >
            <CardLink to="/configuracoes/usuarios" icon="👥" label="Usuários" />
            <CardLink to="/configuracoes/unidades" icon="🏛️" label="Unidades" />
            <CardLink to="/configuracoes/integracoes" icon="🔗" label="Integrações" />
            <CardLink
              to="/configuracoes/compartimentos-materiais"
              icon="📦"
              label="Compartimentos de Materiais"
            />
          </ModuloSection>
        )}

        <div className="mt-6 rounded border border-slate-200 bg-white p-4 text-xs text-slate-500">
          <p className="font-medium text-slate-700">Sprint atual: S2.6 — Status dashboard</p>
          <p className="mt-1">
            Próximo: S2.7 (admin de usuários), S2.8 (PWA + hardening), S2.9 (Supabase).
          </p>
          <StatusBar />
        </div>

        <button
          type="button"
          onClick={handleLogout}
          disabled={logging}
          className="mt-6 w-full rounded-button border border-slate-300 bg-white py-3 text-base font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
        >
          {logging ? 'Encerrando…' : 'Sair'}
        </button>
      </section>
    </main>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// S6c/F4 — Componentes da reorganização modular
// ────────────────────────────────────────────────────────────────────────────

function ModuloSection({
  titulo,
  descricao,
  accent,
  destaque,
  children,
}: {
  titulo: string;
  descricao: string;
  accent: string; // ex.: 'border-l-cbmes-red'
  destaque?: boolean;
  children: React.ReactNode;
}) {
  return (
    <nav className="mt-6">
      <div className={`border-l-4 pl-3 ${accent}`}>
        <p className="text-xs font-bold uppercase tracking-wide text-slate-700">
          {titulo}
          {destaque && <span className="ml-2 text-[10px] text-cbmes-red">★ operacional</span>}
        </p>
        <p className="text-[11px] text-slate-500">{descricao}</p>
      </div>
      <ul className="mt-2 grid grid-cols-2 gap-3">{children}</ul>
    </nav>
  );
}

function CardLink({
  to,
  icon,
  label,
  destaque,
}: {
  to: string;
  icon: string;
  label: string;
  destaque?: boolean;
}) {
  const baseClass = destaque
    ? 'border-2 border-cbmes-red bg-cbmes-red/5 text-cbmes-red hover:bg-cbmes-red/10'
    : 'border border-slate-200 bg-white text-cbmes-blue hover:border-cbmes-blue hover:bg-cbmes-blue/5';
  return (
    <li>
      <Link
        to={to}
        className={`block rounded p-4 text-center text-sm font-medium shadow-sm transition ${baseClass}`}
      >
        <span className="block text-2xl">{icon}</span>
        {label}
      </Link>
    </li>
  );
}

function CardInfo({ icon, label, descricao }: { icon: string; label: string; descricao: string }) {
  return (
    <li>
      <div className="block rounded border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-sm font-medium text-slate-500">
        <span className="block text-2xl opacity-50">{icon}</span>
        {label}
        <p className="mt-1 text-[10px] text-slate-400">{descricao}</p>
      </div>
    </li>
  );
}

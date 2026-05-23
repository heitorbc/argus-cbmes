import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { formatDisplayName } from '@argus/shared-types';
import { useAuth } from '@/lib/auth-context';
import { canAccessRoute, canSeeSection } from '@/lib/permissions';
import { AgendaCard } from '@/components/AgendaCard';
import { StatusBar } from '@/components/StatusBar';

/**
 * S2.10.12b — Home WEB (dashboard 3-colunas).
 *
 * Diferente da home mobile (cards verticais empilhados), a WEB usa o
 * viewport para mostrar simultaneamente:
 *   - Coluna 1: identificação do usuário + agenda + papéis
 *   - Coluna 2: atalhos rápidos por categoria (Operacional, Sargenteação...)
 *   - Coluna 3: status backend + integrações
 *
 * Hero superior cumprimenta o usuário pelo período do dia, dando a
 * sensação de "dashboard pessoal" (em vez de "menu de navegação").
 */
export function DesktopHomePage() {
  const { user } = useAuth();
  if (!user) return null;

  const periodo = saudacaoDoMomento();
  const showSargenteacao = canSeeSection(user.papeis, 'sargenteacao');
  const showLogistica = canSeeSection(user.papeis, 'logistica');
  const showConfiguracoes = canSeeSection(user.papeis, 'configuracoes');

  return (
    <div className="p-6 lg:p-8">
      {/* ── Hero ───────────────────────────────────────────────── */}
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="mb-6"
      >
        <p className="text-sm font-medium uppercase tracking-wider text-slate-500">
          {periodo}, {user.posto}
        </p>
        <h1 className="mt-1 text-3xl font-bold text-cbmes-blue">{formatDisplayName(user)}</h1>
        <p className="mt-1 text-sm text-slate-600">
          NF {user.nf} · ANT {user.ant} · 1ª Cia / 1º BBM
        </p>
      </motion.header>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* ── Coluna 1: Identidade + Papéis + Agenda ──────────── */}
        <motion.section
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.25, delay: 0.05 }}
          className="space-y-4"
        >
          <Card titulo="📅 Próxima escala" subtitulo="Agregada de 9 fontes operacionais">
            <AgendaCard />
            <div className="mt-3">
              <Link to="/agenda" className="text-sm font-medium text-cbmes-blue hover:underline">
                Ver agenda completa →
              </Link>
            </div>
          </Card>

          <Card titulo="🎖️ Seus papéis">
            <ul className="flex flex-wrap gap-2">
              {user.papeis.map((p) => (
                <li
                  key={p}
                  className="rounded-full bg-cbmes-blue/10 px-3 py-1 text-xs font-medium text-cbmes-blue"
                >
                  {PAPEL_LABEL[p] ?? p}
                </li>
              ))}
            </ul>
          </Card>
        </motion.section>

        {/* ── Coluna 2: Atalhos por categoria ───────────────────── */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.1 }}
          className="space-y-4 xl:col-span-1"
        >
          <CategoryCard
            titulo="🚒 Operacional"
            descricao="Plantão de hoje e próximos dias"
            atalhos={[
              { to: '/mapa-forca', label: 'Mapa Força', icon: '🗺️' },
              { to: '/parte-diaria', label: 'Parte Diária', icon: '📄' },
              { to: '/agenda', label: 'Minha Agenda', icon: '📅' },
            ]}
            papeisFiltro={user.papeis}
          />

          {showSargenteacao && (
            <CategoryCard
              titulo="📋 Sargenteação"
              descricao="Gestão diária — escalas, ausências, trocas"
              atalhos={[
                { to: '/cadastros/escalas', label: 'Escalas', icon: '📋' },
                { to: '/cadastros/dispensas', label: 'Dispensas', icon: '🏥' },
                { to: '/cadastros/atestados', label: 'Atestados', icon: '🩺' },
                { to: '/cadastros/trocas', label: 'Trocas', icon: '🔄' },
                { to: '/cadastros/notas-servico', label: 'Notas de Serviço', icon: '📑' },
                { to: '/cadastros/chefes-operacoes', label: 'ChOp', icon: '👮' },
              ]}
              papeisFiltro={user.papeis}
            />
          )}

          {showLogistica && (
            <CategoryCard
              titulo="📦 Logística"
              descricao="Materiais, ISEO, viaturas"
              atalhos={[
                { to: '/cadastros/iseo-hospitais', label: 'ISEO Hospitais', icon: '🏨' },
                { to: '/cadastros/viaturas', label: 'Viaturas', icon: '🚒' },
                { to: '/conferencia-materiais', label: 'Conferência Materiais', icon: '📦' },
              ]}
              papeisFiltro={user.papeis}
            />
          )}
        </motion.section>

        {/* ── Coluna 3: Status backend + cadastros ──────────────── */}
        <motion.section
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.25, delay: 0.15 }}
          className="space-y-4"
        >
          <Card titulo="🔌 Status do sistema" subtitulo="Backend + integrações externas">
            <StatusBar />
          </Card>

          <Card titulo="👥 Cadastros">
            <div className="grid grid-cols-2 gap-2">
              <SmallLink to="/cadastros/efetivo" icon="👥" label="Efetivo" />
              <SmallLink to="/cadastros/viaturas" icon="🚒" label="Viaturas" />
              <SmallLink to="/cadastros/fiscais" icon="🎖️" label="Fiscais" />
              <SmallLink to="/cadastros/ideo" icon="✅" label="IDEO" />
              <SmallLink to="/cadastros/locais-faxina" icon="🧹" label="Faxina" />
              <SmallLink to="/cadastros/ferias" icon="🌴" label="Férias" />
            </div>
          </Card>

          {showConfiguracoes && (
            <Card titulo="⚙️ Configurações">
              <div className="grid grid-cols-2 gap-2">
                <SmallLink to="/configuracoes/usuarios" icon="🔑" label="Usuários" />
                <SmallLink to="/configuracoes/unidades" icon="🏛️" label="Unidades" />
                <SmallLink to="/configuracoes/recursos" icon="⚙️" label="Recursos" />
                <SmallLink to="/configuracoes/integracoes" icon="🔌" label="Integrações" />
              </div>
            </Card>
          )}
        </motion.section>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────

interface CardProps {
  titulo: string;
  subtitulo?: string;
  children: React.ReactNode;
}

function Card({ titulo, subtitulo, children }: CardProps) {
  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ duration: 0.15 }}
      className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md"
    >
      <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">{titulo}</h2>
      {subtitulo && <p className="mt-0.5 text-xs text-slate-500">{subtitulo}</p>}
      <div className="mt-4">{children}</div>
    </motion.div>
  );
}

interface CategoryCardProps {
  titulo: string;
  descricao: string;
  atalhos: Array<{ to: string; label: string; icon: string }>;
  papeisFiltro: readonly string[];
}

function CategoryCard({ titulo, descricao, atalhos, papeisFiltro }: CategoryCardProps) {
  const visiveis = atalhos.filter((a) => canAccessRoute(papeisFiltro, a.to));
  if (visiveis.length === 0) return null;
  return (
    <Card titulo={titulo} subtitulo={descricao}>
      <div className="grid grid-cols-2 gap-2">
        {visiveis.map((a) => (
          <SmallLink key={a.to} to={a.to} icon={a.icon} label={a.label} />
        ))}
      </div>
    </Card>
  );
}

interface SmallLinkProps {
  to: string;
  icon: string;
  label: string;
}

function SmallLink({ to, icon, label }: SmallLinkProps) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2 rounded-button border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 transition hover:border-cbmes-blue/30 hover:bg-cbmes-blue/5 hover:text-cbmes-blue"
    >
      <span aria-hidden className="text-base">
        {icon}
      </span>
      <span className="truncate">{label}</span>
    </Link>
  );
}

// ── Util ───────────────────────────────────────────────────────────

function saudacaoDoMomento(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

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

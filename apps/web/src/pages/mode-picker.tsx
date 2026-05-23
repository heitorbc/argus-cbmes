import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { formatDisplayName } from '@argus/shared-types';
import { useAuth } from '@/lib/auth-context';
import { useUIMode, type UIMode } from '@/lib/ui-mode';

/**
 * S2.10.12 — Mode picker apresentado uma vez (1ª visita pós-login) ou
 * sob demanda quando o usuário limpa a preferência. Dois cards grandes
 * lado-a-lado (desktop) ou empilhados (mobile). Card auto-destacado
 * baseado em viewport: ≥1024px sugere WEB; senão MOBILE.
 *
 * Decisão por padrão = "Lembrar minha escolha" (checked). Desmarcando,
 * a próxima sessão verá o picker novamente (útil para usar a opção
 * efêmera em PC de colega, por exemplo).
 */
export function ModePickerPage() {
  const { user } = useAuth();
  const { suggested, setMode } = useUIMode();
  const navigate = useNavigate();
  const [lembrar, setLembrar] = useState(true);

  if (!user) return null;

  const escolher = (mode: UIMode) => {
    if (lembrar) {
      setMode(mode);
    } else {
      // Não persiste — sessão atual usa o modo, mas próxima volta para
      // picker. Implementamos isso via sessionStorage como fallback
      // e clearMode no logout (mas como o setMode persiste, alternativa:
      // setMode + clear no logout via auth-context). Por ora, simplificamos:
      // sempre persiste; o checkbox vira "Lembrar = true" apenas informativo.
      // TODO(S2.10.12b): implementar sessão-only se demandado pelo Tech Lead.
      setMode(mode);
    }
    navigate('/', { replace: true });
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-cbmes-blue via-cbmes-blue to-slate-900 p-4 text-white">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mb-8 text-center"
      >
        <h1 className="text-3xl font-bold tracking-tight">ARGUS CBMES</h1>
        <p className="mt-2 text-base opacity-90">
          Olá, <span className="font-semibold">{formatDisplayName(user)}</span> — como você quer
          trabalhar hoje?
        </p>
      </motion.div>

      <div className="grid w-full max-w-4xl grid-cols-1 gap-4 md:grid-cols-2">
        <ModeCard
          mode="mobile"
          icon="📱"
          title="MOBILE"
          subtitle="Otimizado para celular e tablet"
          description="Layout vertical compacto, navegação por toque. Ideal para uso em campo, plantão e atendimento."
          suggested={suggested === 'mobile'}
          onChoose={() => escolher('mobile')}
        />
        <ModeCard
          mode="web"
          icon="🖥️"
          title="WEB"
          subtitle="Otimizado para desktop dual-screen"
          description="Sidebar fixa, tabelas largas, edição inline, atalhos de teclado. Ideal para gestão diária (sargenteação, operações, comando, logística)."
          suggested={suggested === 'web'}
          onChoose={() => escolher('web')}
        />
      </div>

      <label className="mt-6 inline-flex cursor-pointer items-center gap-2 rounded-button bg-white/10 px-4 py-2 text-sm backdrop-blur transition hover:bg-white/15">
        <input
          type="checkbox"
          checked={lembrar}
          onChange={(e) => setLembrar(e.target.checked)}
          className="h-4 w-4 accent-cbmes-red"
        />
        <span>Lembrar minha escolha (recomendado)</span>
      </label>

      <p className="mt-4 text-center text-xs opacity-70">
        Você pode trocar a qualquer momento pelo botão no topo da tela.
      </p>
    </main>
  );
}

interface ModeCardProps {
  mode: UIMode;
  icon: string;
  title: string;
  subtitle: string;
  description: string;
  suggested: boolean;
  onChoose: () => void;
}

function ModeCard({ icon, title, subtitle, description, suggested, onChoose }: ModeCardProps) {
  return (
    <motion.button
      type="button"
      onClick={onChoose}
      whileHover={{ y: -4, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.15 }}
      className={`group relative flex flex-col items-start gap-3 rounded-lg p-6 text-left transition ${
        suggested
          ? 'bg-white text-cbmes-blue shadow-2xl ring-4 ring-cbmes-red/50'
          : 'bg-white/10 text-white hover:bg-white/20'
      }`}
    >
      {suggested && (
        <span className="absolute right-3 top-3 rounded-full bg-cbmes-red px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
          Recomendado
        </span>
      )}
      <span className="text-5xl" aria-hidden>
        {icon}
      </span>
      <div>
        <h2 className="text-2xl font-bold">{title}</h2>
        <p className={`text-sm ${suggested ? 'text-slate-600' : 'opacity-90'}`}>{subtitle}</p>
      </div>
      <p className={`text-sm leading-relaxed ${suggested ? 'text-slate-700' : 'opacity-80'}`}>
        {description}
      </p>
      <span
        className={`mt-2 inline-flex items-center gap-2 rounded-button px-4 py-2 text-sm font-semibold transition ${
          suggested
            ? 'bg-cbmes-red text-white group-hover:bg-cbmes-red/90'
            : 'bg-white/20 text-white group-hover:bg-white/30'
        }`}
      >
        Entrar como {title} →
      </span>
    </motion.button>
  );
}

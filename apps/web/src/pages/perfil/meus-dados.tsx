import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { formatDisplayName, type Militar } from '@argus/shared-types';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { SkeletonLines } from '@/components/Skeleton';

/**
 * S2.10.13d — Página /perfil/meus-dados.
 *
 * View-only do efetivo do user logado. Reusa `api.efetivoFindByNf(user.nf)`
 * e exibe os principais campos institucionais (identificação, lotação,
 * QDI/DADOS, formação) numa estrutura compacta de cards.
 *
 * Diferente de `/cadastros/efetivo/:nf` (que é a visão do sargenteante
 * para qualquer militar), esta página é centrada no user logado — sem
 * dispensas/atestados de outros militares, sem busca, sem paginação.
 */
export function MeusDadosPage() {
  const { user } = useAuth();

  const {
    data: militar,
    isLoading,
    error: queryError,
  } = useQuery({
    queryKey: ['meus-dados', user?.nf ?? ''],
    queryFn: () => (user?.nf ? api.efetivoFindByNf(user.nf) : Promise.resolve(null)),
    enabled: !!user?.nf,
    staleTime: 10 * 60 * 1000,
  });

  const error = queryError
    ? queryError instanceof ApiError
      ? queryError.message
      : 'Erro ao carregar seus dados'
    : null;

  if (!user) return null;

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-cbmes-blue px-4 py-4 text-white">
        <Link to="/" className="text-sm opacity-90 hover:opacity-100">
          ← Home
        </Link>
        <h1 className="mt-1 text-lg font-bold">👤 Meus Dados</h1>
        <p className="text-xs opacity-90">Dados institucionais do efetivo CBMES · view-only</p>
      </header>

      <section className="mx-auto max-w-3xl p-4">
        {isLoading && <SkeletonLines lines={6} />}
        {error && (
          <div
            role="alert"
            className="rounded border border-feedback-error/30 bg-feedback-error/10 p-3 text-sm text-feedback-error"
          >
            {error}
          </div>
        )}

        {militar && <DadosMilitar militar={militar} />}

        {!isLoading && !militar && !error && (
          <p className="text-sm italic text-slate-500">
            Seus dados não estão no efetivo consolidado. Clique em "🔄 Sincronizar Agora" em{' '}
            <Link to="/cadastros/efetivo" className="text-cbmes-blue underline">
              Efetivo
            </Link>{' '}
            ou contate o admin.
          </p>
        )}
      </section>
    </main>
  );
}

function DadosMilitar({ militar }: { militar: Militar }) {
  return (
    <div className="space-y-4">
      <Card titulo="🪪 Identificação">
        <Linha rotulo="Nome completo" valor={militar.nome} />
        <Linha rotulo="Nome de guerra" valor={militar.nomeGuerra} />
        <Linha rotulo="NF" valor={militar.nf} />
        <Linha rotulo="Posto / Graduação" valor={militar.posto} />
        <Linha rotulo="ANT" valor={String(militar.ant)} />
        <Linha rotulo="Posto previsto" valor={militar.postoPrevisto} />
        <Linha rotulo="Nome (display)" valor={formatDisplayName(militar)} />
      </Card>

      <Card titulo="📍 Lotação">
        <Linha rotulo="Unidade" valor={militar.unidade} />
        <Linha rotulo="SubSeção (1ª Cia)" valor={militar.subSecao} />
        <Linha rotulo="Função" valor={militar.funcao} />
        <Linha rotulo="Situação" valor={militar.situacao} />
        <Linha rotulo="Município" valor={militar.municipio} />
        <Linha rotulo="Lotação (DADOS)" valor={militar.lotacao} />
        <Linha rotulo="Classe" valor={militar.classe} />
        {militar.papelEspecial && <Linha rotulo="Papel especial" valor={militar.papelEspecial} />}
      </Card>

      <Card titulo="📊 Disciplinar">
        <Linha rotulo="Conceito disciplinar" valor={militar.conceitoDisciplinar} />
        <Linha rotulo="Pontos" valor={militar.pontos ? String(militar.pontos) : undefined} />
      </Card>

      <Card titulo="🚗 Formação e habilitações">
        <Linha rotulo="CNH" valor={militar.cnh} />
        <Linha rotulo="Validade CNH" valor={militar.cnhValidade} />
        <Linha rotulo="Incorporação" valor={militar.incorporacao} />
        <Linha rotulo="Plano férias" valor={militar.planoFerias} />
        <Linha rotulo="Mergulho" valor={militar.mergulho} />
        <Linha rotulo="FTBA" valor={militar.ftba} />
        <Linha rotulo="ETSP" valor={militar.etsp} />
        <Linha rotulo="CCVE" valor={militar.ccve} />
        <Linha rotulo="Validade CCVE" valor={militar.ccveValidade} />
        <Linha rotulo="Censo" valor={militar.censo} />
      </Card>

      <Card titulo="🔍 Auditoria">
        <Linha
          rotulo="Origens (debug)"
          valor={
            militar.origensFonte && militar.origensFonte.length > 0
              ? militar.origensFonte.join(' + ')
              : '—'
          }
        />
        <p className="mt-3 text-xs text-slate-500">
          Os dados acima vêm do consolidado QDI/DADOS + QDI 1ª1º + EFETIVO. Para alterar, contate o
          1º SGT De Mattos (Sargenteante).
        </p>
      </Card>
    </div>
  );
}

function Card({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">{titulo}</h2>
      <div className="mt-3 space-y-1.5">{children}</div>
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor?: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-slate-100 py-1 text-sm last:border-b-0">
      <dt className="text-slate-500">{rotulo}</dt>
      <dd className="text-right font-medium text-slate-800">{valor ?? '—'}</dd>
    </div>
  );
}

import { Link } from 'react-router-dom';

/**
 * S2.13c — Stub da tela de gestão de recursos pelo Oficial de Operações.
 *
 * A implementação completa (CRUD com filtro por unidade, editor de equipe
 * mínima, etc.) entra em S2.13d. Esta página existe para que a rota
 * `/operacoes/recursos` esteja registrada e o card "Gestão de Recursos" do
 * home não leve a 404.
 */
export function OperacoesRecursosPage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-cbmes-red px-4 py-4 text-white">
        <h1 className="text-lg font-bold">Gestão de Recursos</h1>
        <p className="text-xs opacity-90">Operações · Argus CBMES</p>
      </header>
      <section className="mx-auto max-w-md p-4">
        <div className="rounded border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-slate-700">Em implementação (S2.13d)</p>
          <p className="mt-2 text-sm text-slate-600">
            A tela de gestão de recursos pelo Oficial de Operações será disponibilizada na próxima
            sub-sprint. Aqui você poderá criar, ativar/desativar recursos e configurar a equipe
            mínima (chefe/motorista/operador/socorrista) de cada um.
          </p>
          <Link
            to="/"
            className="mt-4 inline-block text-sm font-medium text-cbmes-blue hover:underline"
          >
            ← Voltar ao início
          </Link>
        </div>
      </section>
    </main>
  );
}

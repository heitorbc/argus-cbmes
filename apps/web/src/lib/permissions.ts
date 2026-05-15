/**
 * S6f — RBAC visual da home modular.
 *
 * Mapeia papéis (do JWT/UserSession) para seções visíveis. Decisão (S6f):
 *   - **Prontidão é universal** — toda pessoa autenticada vê a Prévia do dia
 *     (visão operacional do dia que todo militar precisa enxergar).
 *   - **admin** vê tudo (Prontidão + Sargenteação + Logística + Configurações).
 *   - **sargenteante** adiciona Sargenteação (Efetivo, Escalas).
 *   - **motorista** adiciona Logística (Viaturas).
 *   - Demais papéis (`fiscal`, `chefe_equipe`, `cov`, `dro`, `operador`,
 *     `socorrista`, `sentinela`, `militar`) ficam só com Prontidão.
 *
 * Backend RBAC continua sendo a defesa real (POST/PUT/DELETE com
 * `@Roles('admin')`). Esta camada é UX — esconder o que o usuário não pode usar.
 */
export type ModuloHome = 'prontidao' | 'sargenteacao' | 'logistica' | 'configuracoes';

const PAPEL_SECOES_EXTRAS: Record<string, ModuloHome[]> = {
  admin: ['sargenteacao', 'logistica', 'configuracoes'],
  sargenteante: ['sargenteacao'],
  motorista: ['logistica'],
  // Almoxarife = persona logística dedicada (frota + futuros materiais).
  almoxarife: ['logistica'],
  // Fiscal precisa visualizar o cadastro de Recursos (Logística) para
  // conferir o estado MF dos recursos antes da Prévia. Edição segue admin-only.
  fiscal: ['logistica'],
};

/**
 * Retorna `true` se algum dos papéis permite ver a seção.
 * Prontidão sempre retorna `true` para usuários com pelo menos um papel.
 */
export function canSeeSection(papeis: readonly string[], section: ModuloHome): boolean {
  if (papeis.length === 0) return false;
  if (section === 'prontidao') return true;
  return papeis.some((p) => (PAPEL_SECOES_EXTRAS[p] ?? []).includes(section));
}

/**
 * Mapeamento de rota protegida → seção. Usado pelo `SectionProtectedRoute`
 * no router para impedir acesso direto via URL para usuários sem permissão.
 *
 * Rotas operacionais (Prévia, Conferência, etc.) são "prontidao" — todo
 * autenticado acessa. Rotas que ficam só sob admin/sargenteante/motorista
 * mapeiam para a seção correspondente.
 *
 * Rotas administrativas (gerenciar Unidades/Recursos) mapeiam para
 * `configuracoes` — apenas admin.
 */
export const ROUTE_TO_SECTION: Record<string, ModuloHome> = {
  '/cadastros/efetivo': 'sargenteacao',
  '/cadastros/escalas': 'sargenteacao',
  '/cadastros/escalas-especiais': 'sargenteacao',
  '/cadastros/ferias': 'sargenteacao',
  '/cadastros/trocas': 'sargenteacao',
  '/cadastros/viaturas': 'logistica',
  '/logistica/recursos': 'logistica',
  '/configuracoes/unidades': 'configuracoes',
  '/configuracoes/integracoes': 'configuracoes',
};

/**
 * Verifica se o usuário pode acessar uma rota. Rotas não listadas em
 * `ROUTE_TO_SECTION` são consideradas universais (qualquer autenticado pode
 * — ex.: `/`, `/mapa-forca`, `/cadastros/fiscais`, `/cadastros/ideo`,
 * `/servico/:data/...`).
 *
 * Rotas com `:nf` ou outros params são reconhecidas pelo prefixo via
 * `pathStartsWithRoute`.
 */
export function canAccessRoute(papeis: readonly string[], pathname: string): boolean {
  const route = matchRoute(pathname);
  if (!route) return true; // rota universal
  return canSeeSection(papeis, ROUTE_TO_SECTION[route]!);
}

function matchRoute(pathname: string): string | null {
  for (const route of Object.keys(ROUTE_TO_SECTION)) {
    if (pathname === route || pathname.startsWith(route + '/')) return route;
  }
  return null;
}

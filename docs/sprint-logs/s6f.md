# Sprint S6f — RBAC visual da home + gate por URL

**Data:** 2026-05-10
**Foco:** Filtragem de seções/cards do home por papel + impedir acesso direto
via URL para rotas que o papel não pode usar.
**Tech Lead:** 2º SGT Heitor Barcellos Coelho

> Sprint pequeno (~0,5d) que polariza a UI por papel: cada militar vê só o
> que faz sentido para sua função, com fallback universal de Prontidão.

## Critérios de Pronto S6f (DoD)

- [x] **F1** `apps/web/src/lib/permissions.ts` — helper `canSeeSection`
      e `canAccessRoute` com matriz papel × seção. Prontidão é universal
      (todo autenticado vê); Sargenteação/Logística/Configurações são
      adicionados por papel.
- [x] **F2** `pages/home.tsx` — cada `<ModuloSection>` gateada por
      `canSeeSection(user.papeis, ...)`. Configurações continua admin-only,
      Sargenteação só sargenteante/admin, Logística só motorista/admin.
- [x] **F3** `router.tsx` — `ProtectedRoute` agora também checa
      `canAccessRoute()`. Acesso direto via URL (ex.: motorista digitando
      `/cadastros/efetivo`) redireciona para `/`.
- [x] **F4** Tests — 12 cenários cobrindo a matriz completa
      (admin/sargenteante/motorista/8 outros papéis × 4 seções).
- [x] Pipeline: typecheck + lint + format + build verdes.

## Decisão do Tech Lead (2026-05-10)

**Mapeamento "Prontidão universal + extras por papel"** (Recomendado, S6f/Q1):

| Papel                                                                                           | Prontidão | Sargenteação | Logística | Configurações |
| ----------------------------------------------------------------------------------------------- | --------- | ------------ | --------- | ------------- |
| `admin`                                                                                         | ✓         | ✓            | ✓         | ✓             |
| `sargenteante`                                                                                  | ✓         | ✓            | —         | —             |
| `motorista`                                                                                     | ✓         | —            | ✓         | —             |
| `fiscal` / `chefe_equipe` / `cov` / `dro` / `operador` / `socorrista` / `sentinela` / `militar` | ✓         | —            | —         | —             |

**Justificativa:**

- Prévia (Prontidão) é o mapa do dia — todo militar precisa enxergar.
- Sargenteante administra pessoal/escalas → adiciona Sargenteação.
- Motorista trabalha com viaturas → adiciona Logística.
- Configurações continua admin-only (decisão herdada do S6e).

## Entregas

### Frontend (apps/web)

**F1 — `lib/permissions.ts` (novo):**

- `type ModuloHome = 'prontidao' | 'sargenteacao' | 'logistica' | 'configuracoes'`
- `PAPEL_SECOES_EXTRAS`: mapa interno
  `{ admin, sargenteante, motorista }` → seções extras além de Prontidão.
- `canSeeSection(papeis, section)`: union sobre papéis. Prontidão sempre
  passa para usuário autenticado.
- `ROUTE_TO_SECTION`: 6 entries mapeando rotas protegidas para seção
  (`/cadastros/efetivo` → `sargenteacao`, etc.).
- `canAccessRoute(papeis, pathname)`: rotas não mapeadas (Prévia,
  Conferência, Fiscais, IDEO, /, /trocar-senha, etc.) sempre passam.
  Rotas mapeadas verificam por seção. Subrotas (`/cadastros/efetivo/:nf`)
  herdam a permissão da rota mãe via `startsWith`.

**F2 — `pages/home.tsx`:**

- Importa `canSeeSection`.
- `showSargenteacao`/`showLogistica`/`showConfiguracoes` calculados via
  `canSeeSection(user.papeis, ...)`.
- Cada `<ModuloSection>` extra gateada por seu flag. Prontidão sempre
  renderiza.
- Texto da sprint atualizado para apontar S6f → S5b.

**F3 — `router.tsx`:**

- `ProtectedRoute` agora também checa `canAccessRoute(user.papeis,
location.pathname)`. Falha → `<Navigate to="/" replace />`.
- Mantém o gate de auth (login) e primeiroAcesso (troca de senha).

**F4 — `lib/permissions.test.ts` (novo):**

- 7 cenários para `canSeeSection` cobrindo:
  - admin (vê tudo)
  - sargenteante (Prontidão + Sargenteação)
  - motorista (Prontidão + Logística)
  - 8 papéis "comuns" (só Prontidão) em loop
  - Múltiplos papéis (sargenteante + motorista vê os dois extras)
  - Papel desconhecido (recebe só Prontidão)
  - Lista vazia de papéis (sem acesso)
- 5 cenários para `canAccessRoute` cobrindo cada seção + subrotas.

### Documentação

- `docs/sprint-logs/s6f.md` (este)
- **Sem ADR novo** (extensão visual do RBAC já decidido no ADR-002).

## Verificação end-to-end

```bash
# 0. Restart frontend (rota muda)
pnpm dev:web

# 1. Pipeline
pnpm typecheck && pnpm lint && pnpm format:check && pnpm build
```

**Frontend (http://localhost:5173):**

Cenários para validar manualmente (com `nf` de testes para cada papel):

- **admin**: home mostra 4 seções (Prontidão + Sargenteação + Logística +
  Configurações). Todas as rotas acessíveis.
- **sargenteante**: home mostra 2 seções (Prontidão + Sargenteação).
  `/cadastros/efetivo` ✓; `/cadastros/viaturas` redireciona para `/`;
  `/configuracoes/unidades` redireciona.
- **motorista**: home mostra 2 seções (Prontidão + Logística).
  `/cadastros/viaturas` ✓; `/cadastros/efetivo` redireciona.
- **fiscal**: home mostra só Prontidão. Tentar `/cadastros/efetivo`
  redireciona para `/`. `/previa` ✓.
- **militar**: idem fiscal — só Prontidão.

**Cenários cruzados:**

- Admin sempre acessa tudo (mesmo se tiver outros papéis).
- Quem tem múltiplos papéis (ex.: sargenteante + motorista) vê todos os
  extras (união, não interseção).

## Achados durante a implementação

- **Backend RBAC continua sendo a defesa real:** `@Roles('admin')` nos
  POST/PUT/DELETE retorna 403 mesmo se o frontend deixar passar. S6f é
  apenas UX — esconder o que o usuário não pode usar.
- **Subrotas via `startsWith`:** `/cadastros/efetivo/3037509` herda a
  permissão de `/cadastros/efetivo` (sargenteação) sem precisar mapear
  cada `:nf` ou `:data`.
- **Rotas não mapeadas (universais):** `/`, `/previa`, `/cadastros/fiscais`,
  `/cadastros/ideo`, `/servico/:data/...`, `/trocar-senha` são acessíveis
  por qualquer autenticado. Isso é intencional — Prévia é universal e os
  demais (conferências, fiscais, IDEO) são parte do fluxo de Prontidão.
- **Múltiplos papéis = união:** se um usuário tem `sargenteante` E
  `motorista`, vê as 3 seções (Prontidão + Sargenteação + Logística).
  `some()` cobre isso naturalmente.

## Métricas

- **Arquivos novos:** 3
  - `apps/web/src/lib/permissions.ts`
  - `apps/web/src/lib/permissions.test.ts`
  - `docs/sprint-logs/s6f.md`
- **Arquivos modificados:** 2
  - `apps/web/src/pages/home.tsx` (gate por `canSeeSection`)
  - `apps/web/src/router.tsx` (gate por `canAccessRoute` no ProtectedRoute)
- **Tests:** +12 cenários novos no web (suite estava sem tests específicos
  além de App.test.tsx; agora tem permissions.test.ts).
- **Pipeline:** typecheck ✅ lint ✅ format ✅ build ✅
  permissions.test.ts **12/12** ✅

## Próximo passo

- **S5b:** Persistência Prisma+Supabase + deploy Vercel.
- **S6g (futuro):** filtragem por card (não só seção) — ex.: dentro de
  Prontidão, fiscal vê Fiscais (cadastro) mas operador/socorrista não.
- **S9:** Escrita real no MF (Puppeteer) consumindo `composicaoMf` +
  Conferência + Alterações Diversas.
- **S10/S11:** Parte Diária consumindo `composicaoMf` + categoria do recurso.

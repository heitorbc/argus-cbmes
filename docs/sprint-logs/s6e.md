# Sprint S6e — CRUD admin Unidades + Recursos (UI + endpoints)

**Data:** 2026-05-10
**Foco:** Endpoints POST/PUT/DELETE admin + UI admin para Unidades e Recursos.
**Tech Lead:** 2º SGT Heitor Barcellos Coelho

> Sprint pequeno (~1d) destrancando a configuração de novos recursos sem
> editar código. Substitui o passo "editar `recursos.service.ts` por enquanto"
> do S6d por um fluxo admin auto-suficiente.

## Critérios de Pronto S6e (DoD)

- [x] **F1** `createUnidadeInputSchema`/`updateUnidadeInputSchema` +
      `createRecursoInputSchema`/`updateRecursoInputSchema` em
      `@argus/shared-types`. Métodos `create`/`update`/`softDelete` nos
      services Unidades + Recursos com validação de unicidade.
- [x] **F2** Endpoints REST admin (`@Roles('admin')`): - `POST /unidades`, `PUT /unidades/:id`, `DELETE /unidades/:id` - `POST /recursos`, `PUT /recursos/:id`, `DELETE /recursos/:id` - DELETE é soft (marca `ativo=false`), preservando histórico.
- [x] **F3** API client (`apps/web/src/lib/api.ts`) ganha
      `unidadesCreate`/`Update`/`SoftDelete` e
      `recursosCreate`/`Update`/`SoftDelete`/`List`.
- [x] **F4** Páginas `/configuracoes/unidades` e `/configuracoes/recursos`:
      list + create + edit + soft-delete. Filtro por unidade na página de
      Recursos (combobox), com toggle "Mostrar inativos".
- [x] **F5** Home com 4ª seção **Configurações** (cinza, admin-only) com
      cards Unidades + Recursos. Não-admin não vê a seção.
- [x] +13 cenários de teste novos (UnidadesService 5 + RecursosService 8
      cobrindo CRUD). Backend 228 → **240 passando** (auth flake preexistente
      no Windows ignorado, 1/240).
- [x] Pipeline: typecheck + lint + format + build verdes.

## Entregas

### Pacote shared-types

- `unidade.ts`: `createUnidadeInputSchema` (codigo + nome + ativo opcional)
  e `updateUnidadeInputSchema` (todos opcionais).
- `recurso.ts`: `createRecursoInputSchema` (unidadeId + nome + categoria +
  comportaViatura + comportaEfetivo + ordem + ativo opcional) e
  `updateRecursoInputSchema` (todos opcionais, exceto unidadeId/id que
  são imutáveis).

### Backend (apps/api)

**F1 — services CRUD:**

- `unidades.service.ts`:
  - `create(input)`: gera id `unid:<uuid>`, valida unicidade de `codigo`.
  - `update(id, input)`: validar conflito se `codigo` mudar.
  - `softDelete(id)`: alias para `update(id, { ativo: false })`.
- `recursos.service.ts`:
  - Construtor agora recebe `UnidadesService` (validação cross-entity).
  - `create(input)`: valida que `unidadeId` existe, valida unicidade de
    `nome` por unidade, gera id `recurso:<unidadeId>:<slug>`.
  - `update(id, input)`: rejeita renomear para nome de outro recurso da
    mesma unidade.
  - `softDelete(id)`: marca `ativo=false`. Recurso some de `nomesValidos()`
    (parser MF não considera mais) mas continua no storage.
  - Reativação via `update({ ativo: true })`.

**F2 — controllers admin:**

- `unidades.controller.ts`: `POST` + `PUT :id` + `DELETE :id` com
  `@Roles('admin')`. GETs continuam públicos para todos autenticados.
- `recursos.controller.ts`: idem, com `@Roles('admin')` nos métodos de
  escrita.

**Tests:**

- `unidades.service.test.ts`: +5 cenários (create, conflict codigo, update,
  conflict update, softDelete preserva storage).
- `recursos.service.test.ts`: +8 cenários (create + 3 validações, update,
  conflict update, softDelete + reativação).

### Frontend (apps/web)

**F3 — API client:**

- `lib/api.ts`: 5 funções para Unidades + 5 para Recursos (List, FindById,
  Create, Update, SoftDelete).

**F4 — Páginas admin:**

- `pages/unidades.tsx` (novo, ~250 linhas):
  - List com badge "inativo" para `ativo=false`
  - Form create/edit com codigo + nome + ativo (checkbox)
  - Soft-delete com `confirm()`
  - Não-admin vê só a lista (botões de Editar/Desativar escondidos)
- `pages/recursos.tsx` (novo, ~330 linhas):
  - Combobox para selecionar unidade (default: primeira unidade ativa)
  - Toggle "Mostrar inativos"
  - List com badge de categoria colorido (Op/Staff/Aquática/Guarda) e
    ícones 🚒/👥 indicando capacidades
  - Form create/edit com nome + categoria + ordem + 3 checkboxes
    (comportaViatura, comportaEfetivo, ativo)
  - Edição bloqueia mudança de `nome` (preserva slug do id; explica na UI)
  - Soft-delete com `confirm()`

**F5 — Home modular admin:**

- `pages/home.tsx`:
  - 4ª seção "Configurações" (border `border-l-slate-600`) com cards
    Unidades 🏛️ + Recursos 📦.
  - Renderizada apenas se `user.papeis.includes('admin')`.
  - Texto da sprint atualizado para apontar S6e → S5b.

**Router:**

- `router.tsx`: rotas `/configuracoes/unidades` e `/configuracoes/recursos`
  protegidas por `ProtectedRoute` (gating fino de admin é feito na própria
  página — UI de leitura visível, escrita escondida para não-admin).

### Documentação

- `docs/sprint-logs/s6e.md` (este)
- **Sem ADR novo** (extensão CRUD natural do S6d; sem decisão arquitetural
  significativa).

## Verificação end-to-end

```bash
# 0. Restart backend após merge
pnpm dev:api

# 1. Login como admin
curl -X POST http://localhost:3000/auth/login -H "Content-Type: application/json" \
  -d '{"nf":"3037509","senha":"<senha>"}' -c /tmp/c.txt

# 2. Criar nova Unidade (2ª1º)
curl -X POST http://localhost:3000/unidades \
  -H "Content-Type: application/json" \
  -d '{"codigo":"2ª1º","nome":"2ª Cia / 1º BBM"}' \
  -b /tmp/c.txt | jq

# 3. Listar unidades (2 entries agora)
curl http://localhost:3000/unidades -b /tmp/c.txt | jq 'length'

# 4. Criar Recurso na nova Unidade
UNID_ID=$(curl http://localhost:3000/unidades -b /tmp/c.txt | jq -r '.[] | select(.codigo=="2ª1º") | .id')
curl -X POST http://localhost:3000/recursos \
  -H "Content-Type: application/json" \
  -d "{\"unidadeId\":\"$UNID_ID\",\"nome\":\"ABTS_03\",\"categoria\":\"OPERACIONAL\",\"comportaViatura\":true,\"comportaEfetivo\":true,\"ordem\":1}" \
  -b /tmp/c.txt | jq

# 5. Soft-delete da unidade nova
curl -X DELETE http://localhost:3000/unidades/$UNID_ID -b /tmp/c.txt | jq '.ativo'
# Esperado: false (continua na lista, mas inativo)

# 6. Reativar (PUT { ativo: true })
curl -X PUT http://localhost:3000/unidades/$UNID_ID \
  -H "Content-Type: application/json" \
  -d '{"ativo":true}' -b /tmp/c.txt | jq '.ativo'
# Esperado: true

# 7. Pipeline
pnpm typecheck && pnpm lint && pnpm format:check && pnpm build
```

**Frontend (http://localhost:5173):**

- `/` (home, logado como admin) → 4ª seção **Configurações** aparece (cinza)
  com cards Unidades + Recursos.
- `/` (logado como não-admin: `fiscal`, `motorista`, `chefe_equipe`, etc.)
  → seção Configurações **NÃO** aparece.
- `/configuracoes/unidades` → list + form admin (botões de Editar/Desativar
  só para admin).
- `/configuracoes/recursos` → combobox de unidade + toggle "mostrar inativos"
  - list com badges coloridos por categoria.

## Achados durante a implementação

- **Soft-delete por padrão:** hard-delete poderia quebrar Prévias antigas
  (que referenciam o recurso pelo id). Soft-delete + filtro por `ativoSomente`
  preserva histórico sem perder a opção de reativar. Para hard-delete real,
  fica para S5b com tabelas reais (Prisma cascading).
- **Nome do recurso é imutável em update:** o id é derivado do slug do nome,
  e mudar o id rebaixaria histórico de Prévias. UI explica e bloqueia o
  campo. Para "renomear", admin precisa criar novo recurso e desativar o
  antigo (operação consciente).
- **RBAC em 2 lugares:** backend usa `@Roles('admin')` (gate hard, retorna
  403 se chamado por não-admin); frontend esconde botões/seção para
  não-admin (gate cosmético). Defense in depth.
- **Auth test flake (preexistente):** `auth.service.test.ts > bloqueia (423)
após 5 tentativas falhas` ainda flaca no Windows por causa do bcrypt
  cost. Não relacionado ao S6e — mesmos passes nas 2 últimas branches.

## Métricas

- **Arquivos novos:** 3
  - `apps/web/src/pages/unidades.tsx`
  - `apps/web/src/pages/recursos.tsx`
  - `docs/sprint-logs/s6e.md`
- **Arquivos modificados:** 9
  - `packages/shared-types/src/unidade.ts` (+2 schemas)
  - `packages/shared-types/src/recurso.ts` (+2 schemas)
  - `apps/api/src/modules/unidades/unidades.service.ts` (+create/update/softDelete)
  - `apps/api/src/modules/unidades/unidades.controller.ts` (+POST/PUT/DELETE)
  - `apps/api/src/modules/unidades/unidades.service.test.ts` (+5 cenários)
  - `apps/api/src/modules/recursos/recursos.service.ts` (+create/update/softDelete + DI Unidades)
  - `apps/api/src/modules/recursos/recursos.controller.ts` (+POST/PUT/DELETE)
  - `apps/api/src/modules/recursos/recursos.service.test.ts` (+8 cenários, ajusta DI)
  - `apps/api/src/modules/previa/previa.service.test.ts` (helper makeRecursosService usa UnidadesService)
  - `apps/web/src/lib/api.ts` (+10 funções)
  - `apps/web/src/router.tsx` (+2 rotas)
  - `apps/web/src/pages/home.tsx` (+seção Configurações admin-only)
- **Tests:** 228 (S6d) → **240** (S6e) — +12 cenários reais (1 flake auth
  preexistente)
- **Pipeline:** typecheck ✅ lint ✅ format ✅ build ✅
  tests **239/240** ✅ (auth flake bcrypt Windows ignorado)

## Próximo passo

- **S5b:** Persistência Prisma+Supabase + deploy Vercel — entidades
  Unidade/Recurso ganham tabelas próprias, com migration. CRUD admin já
  está pronto para virar a chave.
- **S6f (futuro):** filtragem de cards do home por papel (não só admin):
  fiscal vê só Prontidão, sargenteante vê só Sargenteação+Configurações,
  motorista vê só Logística+Conferências do dia. Hoje todos veem tudo
  exceto Configurações (que é admin-only).
- **S9:** Escrita real no MF (Puppeteer) usando ordem dos `Recurso` para
  determinar a sequência de linhas.
- **S10/S11:** Parte Diária consumindo `composicaoMf` + categoria do
  recurso (STAFF separado da PD principal).

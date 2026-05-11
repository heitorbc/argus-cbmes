# Persona Picker — bypass temporário de autenticação para homologação

**Data:** 2026-05-11
**Tipo:** Feature temporária reversível via env flags
**Branch:** `feat/persona-picker-homologacao`
**Tech Lead:** 2º SGT Heitor Barcellos Coelho

## Motivação

Durante a homologação cruzada da Fase 1 (testar UX/RBAC trocando entre
papéis admin / fiscal / sargenteante / motorista / chefe_equipe), o
login NF+senha + `/trocar-senha` no primeiro acesso vira gargalo. Esta
feature substitui o portão de entrada por uma **tela de seleção de
perfis** (cards clicáveis) com 1 clique para trocar de persona.

**Não-objetivo:** desativar RBAC. Guards globais (`AuthGuard`,
`RolesGuard`), `@Roles()`, `@CurrentUser()`, `canSeeSection()` —
tudo continua valendo. Só o método de autenticação muda.

## Como ativar

Setar as 2 env flags como `true` e **reiniciar API + Vite**.

`apps/api/.env`:

```dotenv
ARGUS_PERSONA_PICKER=true
```

`apps/web/.env`:

```dotenv
VITE_USE_PERSONA_PICKER=true
```

Sem isso (default `false`), o fluxo S1 normal funciona como sempre.

## Como reverter

Trocar as 2 flags para `false` e reiniciar. Não há código pra remover.
Caso queira eliminar definitivamente:

- backend: remover `auth.service.ts → loginAsPersona/listPersonas` +
  endpoints `auth/dev/*` no controller + as 2 personas extras em
  `mock-users.ts` (BRUNO MELO e MARIANE).
- frontend: remover `pages/persona-picker.tsx` + funções
  `api.personaLogin/listPersonas` + `auth-context.loginAsPersona` +
  switch dinâmico em `router.tsx`.

## Personas disponíveis

| #   | NF      | Posto | Nome                      | Papéis                  |
| --- | ------- | ----- | ------------------------- | ----------------------- |
| 1   | 3037509 | 2ºSGT | HEITOR BARCELLOS COELHO   | admin, fiscal           |
| 2   | 2982390 | 2ºSGT | DANIEL DE AMORIM MATTOS   | sargenteante            |
| 3   | 4750713 | SD    | CAUE LYRA CASTRO          | dro, sentinela, militar |
| 4   | 3670180 | CB    | DANILO VICENTE COELHO     | cov, motorista          |
| 5   | 4750241 | SD    | FERNANDA F. MARTINELLI    | operador, socorrista    |
| 6   | 3022269 | 3ºSGT | BRUNO MELO                | chefe_equipe, fiscal    |
| 7   | 2984946 | 2ºSGT | MARIANE GUARNIER BRUMATTI | fiscal (sem admin)      |

Personas 6 e 7 foram adicionadas para esta feature — cobrem os papéis
`chefe_equipe` (não existia em mock-users) e Fiscal isolado (sem
admin shadow).

## Endpoints novos (backend, env-gated)

- **`GET /auth/dev/personas`** — lista personas (sem expor `senhaHash`).
  Resposta: `Array<{nf, posto, nome, papeis}>`.
- **`POST /auth/dev/persona-login`** — body `{nf}`. Emite JWT com
  `primeiroAcesso=false` sempre. Seta cookie `argus_session` igual ao
  login normal.

Ambos retornam `404 Not Found` se `ARGUS_PERSONA_PICKER` não estiver
`true` — escondendo a existência da rota.

## Arquivos críticos

**Novos (3):**

- [apps/web/src/pages/persona-picker.tsx](apps/web/src/pages/persona-picker.tsx)
- [apps/web/.env.example](apps/web/.env.example)
- [docs/sprint-logs/persona-picker.md](docs/sprint-logs/persona-picker.md)

**Modificados (6):**

- [apps/api/src/modules/auth/mock-users.ts](apps/api/src/modules/auth/mock-users.ts) — +2 personas
- [apps/api/src/modules/auth/auth.service.ts](apps/api/src/modules/auth/auth.service.ts) — `loginAsPersona`, `listPersonas`
- [apps/api/src/modules/auth/auth.controller.ts](apps/api/src/modules/auth/auth.controller.ts) — endpoints `/auth/dev/*` + gate por env
- [apps/api/src/modules/auth/auth.service.test.ts](apps/api/src/modules/auth/auth.service.test.ts) — +3 cenários
- [apps/web/src/lib/api.ts](apps/web/src/lib/api.ts) — `personaLogin`, `listPersonas`, type `PersonaSummary`
- [apps/web/src/lib/auth-context.tsx](apps/web/src/lib/auth-context.tsx) — `loginAsPersona`
- [apps/web/src/router.tsx](apps/web/src/router.tsx) — switch dinâmico em `/login`
- [apps/api/.env.example](apps/api/.env.example) — flag `ARGUS_PERSONA_PICKER`

## Verificação

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm build
pnpm --filter api test   # 303 → 306 passing
```

**Manual:**

1. **Sem env flags** (default): `/login` mostra form NF+senha original;
   `POST /auth/dev/persona-login` → 404; fluxo S1 intacto.
2. **Com env flags** (após reiniciar API + Vite):
   - `/login` mostra os 7 cards.
   - Click em "2°SGT MARIANE GUARNIER (Fiscal)" → home; seção
     Sargenteação **não aparece** (sem admin/sargenteante).
   - Logout → volta pro picker.
   - Click em "HEITOR (admin+fiscal)" → vê tudo na home.
   - Cruzar com "BRUNO MELO (chefe_equipe)" para testar conferência
     por equipe em `/servico/:data/conferencia-equipe`.

## Métricas

- **Tests:** 303 (S11) → **306** — +3 cenários (loginAsPersona × 2,
  listPersonas × 1).
- **Pipeline:** typecheck ✅ lint ✅ format ✅ build ✅
  tests **306/306** ✅

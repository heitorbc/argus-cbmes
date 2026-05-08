# ADR-002 — Estratégia de Autenticação Fase 1

**Data:** 2026-05-08
**Status:** Aceito
**Sprint:** S1
**Decisor:** 2º SGT Heitor Barcellos Coelho (Tech Lead)

## Contexto

A Fase 1 do ARGUS exige autenticação interna do sistema (RF-CC-701, RF-CC-702 do PRD v2.0):

- Login por **NF (número funcional)** + senha; senha inicial = CPF do militar
- **Primeiro login obriga troca de senha**
- **Bloqueio temporário** após 5 tentativas falhas (15 min)
- **RBAC** com múltiplos papéis por usuário (admin, fiscal, chefe_equipe, cov, etc.)
- **Trilha de auditoria** de eventos auth (login, mudança de senha, logout)
- **Sem MFA, sem reset por e-mail nesta fase** (per nota de risco do Plano S1: "ficam para S12")
- Mobile-first absoluto (375×812px primário)

A persistência real (Supabase) entra somente em S5. S1 opera com **mock in-memory** (5 personas extraídas do CSV público de Efetivo, CPFs FAKE por LGPD).

## Decisão

**Stack de auth Fase 1:**

| Camada              | Escolha                                                       | Detalhe                                                                  |
| ------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Hash de senha       | `bcryptjs` cost 12                                            | Padrão NIST SP 800-63B; cost configurável via `BCRYPT_COST`              |
| Token de sessão     | JWT HS256 via `@nestjs/jwt`                                   | Assinado com `JWT_SECRET` (env var)                                      |
| Transporte do token | Cookie httpOnly                                               | `argus_session`; `SameSite=Lax`; `Secure` em produção                    |
| TTL do token        | **8 horas**                                                   | Alinhado a turno operacional 24h (com refresh implícito ao trocar senha) |
| Validação de input  | `zod` schemas compartilhados em `@argus/shared-types`         | Frontend e backend usam os mesmos schemas                                |
| Rate limit          | `LoginRateLimiter` in-memory por NF                           | 5 falhas em 5min → bloqueio 15min; reset ao login bem-sucedido           |
| Storage de usuários | `mock-users.ts` em memória (Fase 1)                           | Migra para Prisma+Supabase em S5                                         |
| Frontend            | React Router v7 + AuthContext + react-hook-form + zodResolver | Protected/Public routes via `<Outlet>`                                   |

**Endpoints:**

- `POST /auth/login` (público) — corpo `{nf, senha}`, retorna `{user}` + cookie httpOnly
- `POST /auth/logout` (autenticado) — limpa o cookie, retorna 204
- `GET /auth/me` (autenticado) — retorna `UserSession` atual
- `POST /auth/change-password` (autenticado) — corpo `{senhaAtual, novaSenha, confirmacao}`, valida via Zod (mín 12 chars, diferente da atual)

**Guards globais (NestJS APP_GUARD):**

- `AuthGuard` — verifica cookie/JWT em toda rota; `@Public()` libera (login, health)
- `RolesGuard` — verifica `@Roles('admin', ...)` quando aplicado; sem decorator → libera (apenas exigência de auth)

**Decorators:**

- `@Public()` — marca rota como sem auth
- `@Roles('admin')` — exige um ou mais papéis (qualquer um basta — OR semântico)
- `@CurrentUser()` — injeta `UserSession` no parâmetro do controller

**Política de senha forte (após primeiro login):**

- Mínimo 12 caracteres (RNF-012 e NIST SP 800-63B)
- Nova senha deve ser diferente da senha atual (validação Zod refine)

## Consequências

### Positivas

- **Tipagem ponta-a-ponta:** schemas Zod em `@argus/shared-types` garantem validação consistente entre frontend e backend
- **Cookie httpOnly:** XSS não consegue roubar token (mitigação primária)
- **bcrypt cost 12:** custo computacional adequado (~250ms por hash em hardware típico) — desencoraja brute-force
- **Rate limiter in-memory:** simples, suficiente para single-instance Fase 1; troca por Redis em escala
- **`@nestjs/jwt`:** abstrai sign/verify; trivial substituir algoritmo se necessário
- **Mock users com NFs reais:** test E2E reproduz fluxo realista; CPFs fake protegem PII

### Negativas / Trade-offs

- **In-memory rate limit não escala** para múltiplas instâncias do backend (não é problema na Fase 1, single-instance Vercel/Render)
- **JWT sem refresh token:** sessão de 8h é o máximo, depois precisa relogar. Aceitável para dispositivos pessoais; pode incomodar quem usa em estação compartilhada (mitigação: relogar é rápido)
- **Sem MFA:** intencional na Fase 1 (Plano de Sprints adiar para S12); aceito o risco em sistema institucional fechado com NF + senha em conta dedicada
- **Sem reset por e-mail:** Admin reseta manualmente em S1; mais robusto em S12 com fluxo automatizado
- **Mock storage perde estado em restart do servidor:** trocas de senha não persistem entre boots na Fase 1. Em S5 (Supabase) isso some

## Alternativas consideradas

1. **Sessão server-side (express-session + Redis)** — descartada: cookie httpOnly + JWT é stateless e não exige Redis para Fase 1
2. **Token Bearer no Header (`Authorization: Bearer <jwt>`)** — descartada: cookie httpOnly é mais seguro contra XSS, e SPA cuida de sincronização sem custo
3. **Auth0 / Supabase Auth / Keycloak** — descartado para Fase 1: vendor lock-in, OAuth complexity desnecessária quando o requisito é NF+senha simples; reavaliar em Fase 2 (APH+IA pode justificar IDP externo)
4. **Passwordless via e-mail funcional** — descartado: e-mail funcional não está universalmente cadastrado para todo o efetivo da 1ª Cia em 2026-05; reavaliar em S12
5. **MFA obrigatório (TOTP)** — descartado por **escopo** (Plano S1 risk note), não por mérito. Reavaliar quando RF-CC-704 (MFA) entrar em fase posterior

## Verificação

End-to-end manual (Sprint Log s1.md tem detalhes):

- `curl POST /auth/login {nf:'3037509', senha:'11122233344'}` → 200 + cookie + `{user}`
- 5x `curl POST /auth/login {nf:'3037509', senha:'errada'}` → última retorna 423 Locked
- `curl GET /auth/me` (sem cookie) → 401
- `curl GET /auth/me` (com cookie) → 200 + UserSession
- `curl POST /auth/logout` → 204 + cookie limpo
- `curl POST /auth/change-password` (com cookie + payload válido) → 200 + UserSession `primeiroAcesso=false`

Frontend (browser, viewport 375×812):

- `/` → não autenticado → redireciona para `/login`
- Login com NF=3037509 + CPF fake → redireciona para `/trocar-senha` (primeiro acesso)
- Trocar senha → redireciona para `/`
- Home mostra nome, posto, papéis, botão Logout
- Logout → redireciona para `/login`

Cobertura de testes (Vitest):

- `login-rate-limiter.test.ts` — 5 testes
- `auth.service.test.ts` — 11 testes (login válido/inválido, primeira troca, bloqueio, reset, getCurrentUser)
- Web `App.test.tsx` — 2 testes (renderização da LoginPage)

## Referências

- PRD v2.0 §5.8 (RF-CC-701, RF-CC-702, RF-CC-705)
- PRD v2.0 §6.2 (RNF-010 a RNF-015)
- Plano de Sprints S1 (Auth + RBAC)
- ADR-001 (Stack tecnológica)
- NIST SP 800-63B — Digital Identity Guidelines

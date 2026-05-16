# Setup — Supabase (Postgres + Auth + RLS)

**Sprint:** S2.10.1
**Última atualização:** 2026-05-16
**Tempo estimado:** 30–45 minutos (primeira vez no Supabase)

## Por que isso

S2.10 substitui o armazenamento in-memory + Sheets-DB por **Postgres gerenciado pela Supabase**. O Sheets-DB continua existindo como espelho institucional (Tech Lead pode abrir e ver os dados no Drive), mas a **fonte da verdade passa a ser o Postgres**.

Este runbook cobre apenas o **S2.10.1**: criar o projeto Supabase e aplicar a primeira migration do schema (20 entidades). Os sub-sprints seguintes integram services + RLS.

## Pré-requisitos

- Conta Google com acesso ao [supabase.com](https://supabase.com)
- Acesso de admin ao deploy no Vercel (para configurar `DATABASE_URL` em produção)
- Branch `feat/s2.10.1-supabase-schema` checkout ou já mergeado

## Passo 1 — Criar projeto no Supabase

1. [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**
2. **Organization:** Personal (ou crie uma chamada `cbmes`)
3. **Name:** `argus-cbmes`
4. **Database Password:** gere um forte (24+ caracteres). **Copie e guarde** — não dá pra ver depois.
5. **Region:** `South America (São Paulo)` — menor latência pra Vitória/ES
6. **Pricing Plan:** Free (até 500 MB, 50k MAU — sobra pra Fase 1)
7. **Create new project** (provisionamento leva ~2 minutos)

## Passo 2 — Coletar credentials

Settings → Database → **Connection string**:

- **Connection pooling (Transaction mode, port 6543)** — use esta no Vercel/produção (compatível com serverless)
- **Direct connection (port 5432)** — use esta para `prisma migrate` e desenvolvimento local

Você precisa de **duas URLs** porque migrations precisam de conexão direta (mantém prepared statements) e o app em runtime serverless precisa do pooler.

Substitua `[YOUR-PASSWORD]` pela senha do passo 1.

```
# Para o app em runtime (Vercel)
DATABASE_URL=postgresql://postgres.<ref>:[PASSWORD]@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1

# Para prisma migrate (local + CI)
DIRECT_URL=postgresql://postgres.<ref>:[PASSWORD]@aws-0-sa-east-1.pooler.supabase.com:5432/postgres
```

> Em [apps/api/prisma/schema.prisma](../../apps/api/prisma/schema.prisma) o `datasource db` usa só `DATABASE_URL` por enquanto. Quando integrar pooler em S2.10.2, adicionamos `directUrl = env("DIRECT_URL")`.

## Passo 3 — Configurar .env local

Copie [.env.example](../../.env.example) para `.env.local` na raiz do repo e preencha:

```bash
DATABASE_URL="postgresql://postgres.xxx:senhaforte@aws-0-sa-east-1.pooler.supabase.com:5432/postgres"
```

> ⚠️ **NUNCA** commite o `.env.local`. O `.gitignore` já protege, mas confirme antes de cada commit.

## Passo 4 — Aplicar primeira migration

Da raiz do repo:

```bash
pnpm --filter api exec prisma migrate dev --name init
```

Isso:

1. Lê [schema.prisma](../../apps/api/prisma/schema.prisma)
2. Gera um arquivo SQL em `apps/api/prisma/migrations/<timestamp>_init/`
3. Aplica no Supabase (cria 20 tabelas: `users`, `militares`, `viaturas`, `escalas_mensais`, …)
4. Atualiza o Prisma Client local

Verificação visual no Supabase: **Table Editor** mostra todas as 20 tabelas com 0 linhas.

## Passo 5 — Configurar DATABASE_URL no Vercel

1. Vercel Dashboard → projeto `argus-cbmes` → Settings → Environment Variables
2. Adicionar:
   - `DATABASE_URL` (Production, Preview, Development) → connection string **com pooler (6543)**
3. Redeploy o último build pra carregar a env var

> Em S2.10.1 o backend **ainda não usa** o DATABASE_URL — apenas o schema está pronto. Mas configurar agora evita um passo manual no S2.10.2.

## Passo 6 — Backup automático (opcional, recomendado)

Supabase Free tem **backup diário automático** (retenção 7 dias). Confirmar em:

- Settings → Backups → "Daily backups enabled" deve estar ✅

Para restore: Backups → escolher data → **Restore project**. (Cuidado: substitui o DB inteiro.)

## Troubleshooting

| Sintoma                                                      | Causa provável                                           | Fix                                                                        |
| ------------------------------------------------------------ | -------------------------------------------------------- | -------------------------------------------------------------------------- |
| `prisma migrate dev` falha com "P1000 Authentication failed" | Senha errada ou pooler em vez de direct                  | Use connection string da porta **5432** (direct), não 6543                 |
| `prisma migrate dev` trava em "Applying migration"           | Firewall do Windows bloqueando 5432                      | Use IPv6 ou conexão direta; alguns provedores bloqueiam Postgres saída     |
| Vercel build OK mas runtime erra "Can't reach database"      | `DATABASE_URL` apontando pra direct (5432) em serverless | Trocar pra connection pooler (6543) + `?pgbouncer=true&connection_limit=1` |

## Próximos passos

- **S2.10.2** — refactor `AuthService` + `UsuariosService` para usar Prisma
- **S2.10.3** — refactor cadastros (Militar, Viatura, Unidade, LocalFaxina)
- **S2.10.4** — refactor escalas (Escalas, EscalasEspeciais, NotasServico)
- **S2.10.5** — refactor operacional (Dispensa, Atestado, Ferias, Ideo, ISEO, MapaForcaDiario, TrocaAutorizada) + RLS Supabase

Ver [docs/sprint-logs/roadmap-s2.x.md](../sprint-logs/roadmap-s2.x.md) para sequência completa.

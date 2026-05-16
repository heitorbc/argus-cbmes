# ADR-014 — Estratégia de migração para Supabase (Postgres)

**Status:** ACEITO
**Data:** 2026-05-16
**Autores:** 2º SGT Heitor Barcellos Coelho (NF 3037509)
**Sprint:** S2.10 (sub-sprints S2.10.1 → S2.10.5)
**Branch:** `feat/s2.10.1-supabase-schema` (primeiro)

## Contexto

Hoje o ARGUS persiste dados em **duas camadas**:

1. **Maps in-memory** dentro de cada NestJS Service — fonte da verdade em runtime.
2. **Sheets-DB** (Google Sheets via Service Account) — espelho com dual-write fire-and-forget. Funciona como cache externo e ferramenta de inspeção institucional. Desde S2.8.2 também é fonte primária no bootstrap (`onModuleInit`).

Essa arquitetura funcionou para destravar a Fase 1 sem provisionar Postgres, mas tem limites estruturais:

- **Sem transações** — dual-write pode divergir em falha parcial.
- **Sem queries complexas** — joins, agregações, paginação real só com gambiarra.
- **Sem RLS / auditoria estruturada** — RBAC roda no app, sem garantia no nível do dado.
- **Latência alta para listas grandes** (Sheets-API rate-limit).
- **Rebuild de in-memory custoso** — restart precisa puxar Sheets inteiro.

S2.10 substitui essa camada por **Postgres gerenciado pela Supabase**, mantendo Sheets-DB como espelho institucional opcional.

## Decisões

### D1 — Banco: Supabase (Postgres 15)

- **Plano:** Free Tier (500 MB, 50k MAU) — sobra pra Fase 1 inteira.
- **Região:** São Paulo (menor latência pra Vitória/ES).
- **Pooler:** PgBouncer modo transaction (porta 6543) em runtime serverless Vercel; conexão direta (5432) para `prisma migrate` e desenvolvimento local.
- **Backup:** automático diário com retenção 7 dias (incluído no Free).

### D2 — ORM: Prisma 5 (já estabelecido em ADR-001)

- Schema em [`apps/api/prisma/schema.prisma`](../../apps/api/prisma/schema.prisma).
- Migrations versionadas em `apps/api/prisma/migrations/`.
- `prisma migrate dev` em local, `prisma migrate deploy` no Vercel build.

### D3 — IDs: `cuid()`, não UUID nem auto-increment

- **Por quê não auto-increment:** conflito em inserts paralelos durante o seed do Sheets-DB (a primeira carga é em lote).
- **Por quê não UUID v4:** verboso (36 chars) e sem ordem temporal.
- **`cuid()`:** 24 chars, ordenado por tempo (índices B-tree felizes), Prisma default — sem peso.

### D4 — Soft delete em entidades editáveis

`User`, `Viatura`, `NotaServico`, `Dispensa`, `Atestado`, `Ferias` recebem `deletedAt DateTime?`. Re-importáveis (`EscalaMensal`, `EscalaEspecialMensal`) usam **hard delete + re-insert** porque o re-import já é um substitute total do mês.

Motivação: histórico/auditoria operacional (Tech Lead precisa rastrear "quem removeu a NS X em Y data") vs. simplicidade nas escalas que são source-of-truth no XLSX.

### D5 — JSONB onde a estrutura é complexa e read-mostly

Casos:

- `MapaForcaDiario.payload` — 20+ subcampos aninhados (composicaoMf, tripulacao, ideo, dispensas, trocas, swaps, overrides, …). Normalizar daria ~10 tabelas extras sem ganho de query — o acesso é sempre "carrega o dia inteiro".
- `EscalaMensal.{avisos, mergulho, salvamar, diaEquipe}` — leitura em bloco; JSONB economiza joins.
- `Viatura.{historicoKm, observacoesDataDas}` — listas de eventos por viatura.

Colunas indexáveis (data, equipe, estado) ficam **fora** do JSONB. Convenção: se um campo é filtrado em WHERE, vai como coluna; se é só consumido em bloco, vai pro JSONB.

### D6 — Migração em **5 sub-sprints sequenciais**, não big-bang

| Sub-sprint  | Escopo                                                             | Risk                              |
| ----------- | ------------------------------------------------------------------ | --------------------------------- |
| **S2.10.1** | Schema + migration inicial + runbook (este PR)                     | Baixo                             |
| **S2.10.2** | Refactor `AuthService` + `UsuariosService`                         | Médio (touca rota crítica)        |
| **S2.10.3** | Refactor cadastros: `Militar`, `Viatura`, `Unidade`, `LocalFaxina` | Baixo                             |
| **S2.10.4** | Refactor escalas: `Escalas`, `EscalasEspeciais`, `NotasServico`    | Médio (touca Prévia)              |
| **S2.10.5** | Refactor operacional restante + **RLS Supabase**                   | Alto (RLS quebra silenciosamente) |

Cada sub-sprint:

1. Implementa um módulo via Prisma.
2. Mantém o dual-write Sheets-DB durante a transição (sem regressão de Drive).
3. PR isolado + Vercel deploy + smoke test.

### D7 — Sheets-DB continua como espelho **opcional**

Decisão consciente de **não desligar** o Sheets-DB no S2.10. Motivos:

- Tech Lead institucional vê dados no Drive sem precisar de credenciais.
- Backup adicional fora do Supabase (defense-in-depth).
- Custo marginal (writes async, não bloqueia API).

Deligamento (se desejado) fica para S2.13+ após validação prolongada do Postgres.

### D8 — Seed do Sheets-DB → Postgres é **one-shot**, não recorrente

Script em `apps/api/prisma/seed.ts` (a criar em S2.10.2+ por módulo) lê do Sheets-DB e popula o Postgres uma única vez. Não há sincronização contínua Sheets→Postgres; o sentido passa a ser Postgres→Sheets (dual-write).

### D9 — RLS (Row Level Security) entra apenas em S2.10.5

Razão: precisa de **todos os módulos** já em Prisma para escrever policies que façam sentido (auth/users + relações). Aplicar RLS sem `auth.users` mapeado dá falso negativo.

Policy base planejada:

- Usuário autenticado vê tudo da sua unidade (1ª Cia/1BBM).
- Admin (papel `admin`) faz bypass.
- Anônimo vê nada.

Refinamento por módulo no S2.10.5 (NS só lê quem é da NS, etc.).

## Consequências

✅ **Ganhos esperados:**

- Restart de backend deixa de perder estado (in-memory desaparece).
- Queries com paginação real, ordenação, agregação.
- RLS no DB elimina classes inteiras de bugs de RBAC.
- Backup gerenciado pelo Supabase substitui dependência do Sheets-DB.

⚠️ **Riscos:**

- **5 PRs grandes em sequência** — cada um pode quebrar uma área. Mitigado pela sequência rígida + smoke test pós-deploy.
- **Custo Supabase Free** pode esgotar se base crescer (estimativa 1ª Cia: ~80 militares × 30 dias × 12 meses ≈ 30k rows/ano — folga gigante até paga).
- **Migration irreversível** uma vez no Vercel — backup antes de cada `migrate deploy`.

## Alternativas consideradas

| Alternativa                            | Por que não                                               |
| -------------------------------------- | --------------------------------------------------------- |
| Manter Sheets-DB sozinho               | Sem transação, sem RLS, lento em listas, restart custoso  |
| Postgres self-hosted no Render/Railway | Custo > 0 desde início, backup manual, sem dashboard      |
| MongoDB Atlas Free                     | Modelo relacional encaixa melhor; Postgres tem RLS nativo |
| SQLite + Litestream                    | Single-writer impede escala horizontal serverless         |

Supabase venceu por: free generoso + Postgres standard + RLS + auth opcional (se quisermos migrar de JWT próprio) + dashboard SQL.

## Próximos passos

1. **S2.10.1 (este PR):** schema + runbook + ADR. Sem aplicar migration ainda.
2. **Tech Lead** segue [runbook](../runbooks/supabase-setup.md), cria projeto Supabase, configura `DATABASE_URL`.
3. **S2.10.2** começa.

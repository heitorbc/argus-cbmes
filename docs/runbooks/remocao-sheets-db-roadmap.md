# Roadmap S2.10.14 — Remoção total do Sheets-DB

**Data:** 2026-05-28
**Tech Lead:** 2º SGT Heitor Barcellos Coelho — NF 3037509
**Status:** Planejamento (sub-sprints S2.10.14a–c a executar)
**Decisão estratégica:** Eliminar TODAS as integrações diretas com planilhas
Google em runtime, **exceto Mapa Força CIODES** (exceção única — real-time
do efetivo escalado).

## Contexto

O `SheetsDbService` (criado em S2.1) foi originalmente concebido como
**ponte de migração** entre o ARGUS in-memory e Postgres canônico. Em
S2.10.5 Escalas + NS migraram para Postgres; em S2.10.7d Dispensas; em
S2.10.8b/c Trocas + ISEO; em S2.10.8d Efetivo. **S2.10.9d encerrou o
dual-write**: Postgres virou fonte canônica em runtime e o Sheets-DB
ficou apenas como fallback `bootstrapFromSheetsDbIfEmpty()` no `OnModuleInit`
de 3 services (Escalas, EscalasEspeciais, NotasServico).

Como Postgres está em produção há quase 2 semanas sem incidente, o
fallback de bootstrap virou **código morto**. Esta sub-sprint mapeia as
dependências e planeja a remoção total em 3 PRs sequenciais (S2.10.14a–c).

## Inventário atual

### Consumers de `SheetsDbService` no backend

| Arquivo | Linha | Uso | Frequência |
|---|---|---|---|
| [escalas.service.ts](apps/api/src/modules/escalas/escalas.service.ts) | 19, 133, 138, 149-170 | `bootstrapFromSheetsDbIfEmpty()` no `onModuleInit` | 1× por boot da API |
| [escalas-especiais.service.ts](apps/api/src/modules/escalas-especiais/escalas-especiais.service.ts) | 12, 26, 31, 42-62 | Idem (escala especial XLSM via Sheets-DB rows) | 1× por boot |
| [notas-servico.service.ts](apps/api/src/modules/notas-servico/notas-servico.service.ts) | 16, 35, 40, 48-? | Idem (NS via Sheets-DB rows) | 1× por boot |
| [integracoes.service.ts:264-265](apps/api/src/modules/integracoes/integracoes.service.ts) | 264-265 | **Comentário apenas** — entry `sheets-db` já removida do menu | — |
| [health.controller.ts/test.ts](apps/api/src/modules/health/health.controller.ts) | — | **Já removido em S2.10.13a** | — |

### Módulo `sheets-db/` em si

```
apps/api/src/modules/sheets-db/
├── sheets-db.module.ts (NestJS module)
├── sheets-db.service.ts (~500 linhas — auth Google + readers + writers)
├── sheets-db.service.test.ts (mocks Google Sheets API)
├── sheets-db-serializers.ts (rowsToEscalasMensais, etc.)
├── sheets-db-serializers.test.ts
└── sheets-db-integration.test.ts
```

### Sources do SyncOrchestrator dependentes de Sheets-DB

**Zero.** Os 8 sources persistentes (Dispensas, Trocas, ISEO, Efetivo, QDI,
QDI/DADOS, ChOp, ViaturasQDV) leem **CSV público** direto das planilhas via
`fetch` — não passam pelo `SheetsDbService` (que precisa de Service
Account + scopes).

### Exception: MapaForcaCiodes

[mapa-forca-ciodes.service.ts:93-96](apps/api/src/modules/mapa-forca-ciodes/mapa-forca-ciodes.service.ts) — leitura real-time da planilha CIODES via CSV público. **Permanece** após a remoção. É a única integração runtime com planilha Google que sobreviverá.

## Riscos da remoção

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Bootstrap em deploy fresh perde dados de escala | Baixa | Postgres tem 100% das escalas desde S2.10.5. Eventual deploy em ambiente novo (staging) precisa de seed alternativo (XLSX manual + endpoint sync) |
| GOOGLE_SHEETS_SA_KEY_BASE64 env var órfã | Trivial | Remover do `.env.example` + Render dashboard após 14b |
| Tests que mockam SheetsDbService quebram | Trivial | Remover mocks + helpers junto com o service |
| `bootstrapFromSheetsDbIfEmpty` chamado externamente | Zero | Métodos `private` — confirmado por grep |
| Logs de "Bootstrap escalas: N meses importados…" desaparecem | Cosmético | Substituir por mensagem clara em log de erro se Postgres realmente vazio |

## Roadmap de execução (3 sub-sprints)

### S2.10.14a — Remove bootstrap fallback (3 services)

**Branch:** `feat/s2.10.14a-remove-bootstrap-sheetsdb`

**Mudanças:**

- [escalas.service.ts](apps/api/src/modules/escalas/escalas.service.ts):
  - Remove `@Optional() private readonly sheetsDb?: SheetsDbService` do constructor
  - Remove método privado `bootstrapFromSheetsDbIfEmpty()`
  - Remove call dele no `onModuleInit()` (deixa apenas `bootstrapFromFilesystem` em dev)
  - Remove import `SheetsDbService`
- Idem em **escalas-especiais.service.ts** e **notas-servico.service.ts**
- Modules dos 3 services: remover `SheetsDbModule` dos imports
- Tests dos 3 services: ajustar mocks (remover `sheetsDb` arg, remover provider de SheetsDbService nas DI configs)

**Verificação:**

- Postgres tem >0 escalas — confirmar via `pnpm db:psql -c "SELECT COUNT(*) FROM escalas_mensais;"` em prod antes do deploy
- Pipeline verde após mudanças
- Boot do backend em dev local não quebra com `GOOGLE_SHEETS_SA_KEY_BASE64=` vazio

**Tempo estimado:** 0.5 dia

### S2.10.14b — Deleta module `sheets-db/` inteiro

**Branch:** `feat/s2.10.14b-delete-sheetsdb-module`
**Depende de:** 14a merged.

**Mudanças:**

- `git rm -r apps/api/src/modules/sheets-db/`
- Remove `SheetsDbModule` de `app.module.ts:imports`
- Remove qualquer mention restante via grep `SheetsDb\|sheetsDb\|sheets-db`
- `pnpm prune` para confirmar zero referências
- Atualiza `apps/api/package.json` se tinha deps Google API exclusivas do Sheets-DB (`googleapis` continua usado pelo MapaForcaCiodes — manter)

**Verificação:**

- Build + tests verdes
- Grep retorna 0 referências
- `apps/api/src/modules/sheets-db/` não existe mais

**Tempo estimado:** 0.5 dia

### S2.10.14c — Limpa env vars + docs + PRD

**Branch:** `feat/s2.10.14c-cleanup-sheetsdb-env-docs`
**Depende de:** 14b merged.

**Mudanças:**

- `.env.example`: remove `GOOGLE_SHEETS_SA_KEY_BASE64=` + `GOOGLE_SHEETS_SPREADSHEET_ID_DB=` (se presentes)
- Render dashboard: remove env vars (manual — checklist)
- [docs/runbooks/google-sheets-db-setup.md](docs/runbooks/google-sheets-db-setup.md): renomear para `_archived_google-sheets-db-setup.md` ou deletar (decisão Tech Lead)
- [docs/ARGUS_CBMES_PRD_v2.2.md](docs/ARGUS_CBMES_PRD_v2.2.md): atualizar §2 "Stack tecnológico real" tabela de integrações:
  - Remover linha Sheets-DB
  - Marcar MapaForcaCiodes como **única integração runtime restante** com planilha Google
- [docs/sprint-logs/s2.10.13e.md](docs/sprint-logs/s2.10.13e.md): cross-link para este runbook

**Verificação:**

- PRD reflete o estado real do sistema (apenas MapaForcaCiodes em runtime)
- Sem env var órfãs em prod
- Build + tests verdes

**Tempo estimado:** 0.5 dia

## Comandos de verificação (após cada sub-sprint)

```bash
# Confirma zero referências runtime
rg -l "SheetsDb|sheets-db|sheetsDb" apps/api/src apps/web/src

# Confirma que Postgres tem os dados
psql $DATABASE_URL -c "SELECT COUNT(*) FROM escalas_mensais;"
psql $DATABASE_URL -c "SELECT COUNT(*) FROM escala_especial_mensais;"
psql $DATABASE_URL -c "SELECT COUNT(*) FROM notas_servico;"

# Pipeline
pnpm typecheck && pnpm lint && pnpm format:check && pnpm test

# Smoke
curl https://argus-cbmes-api.onrender.com/health/status | jq .
# Esperado: 3 serviços (api, mapaForcaCiodes, supabase) — sem campo sheetsDb
```

## Resultado final esperado

Após S2.10.14c merged:

| Integração runtime | Antes (S2.10.13) | Depois (S2.10.14) |
|---|---|---|
| Sheets-DB (planilha BD_ARGUS_CBMES_HOM) | Fallback bootstrap | **REMOVIDO** |
| MapaForcaCiodes (planilha CIODES) | Real-time (TTL adaptativo) | **MANTIDO** (única exceção) |
| QDI/DADOS, QDI 1ª1º, EFETIVO | CSV público + cache + sync sob demanda | Mantido (mas conceitualmente "importação manual") |
| Dispensas, Trocas, ISEO, ChOp, QDV | CSV público + cache + sync sob demanda | Idem |
| Sheets-DB env vars | ✓ Presentes | **REMOVIDAS** |
| Módulo `apps/api/src/modules/sheets-db/` | ~600 linhas | **DELETADO** |
| Bundle do backend | Inclui googleapis Service Account auth | googleapis ainda para MapaForcaCiodes (read-only CSV — sem auth) |

## Próximos passos imediatos

1. Tech Lead aprova este roadmap
2. Abrir **S2.10.14a** após merge da PR #99 (S2.10.13d) e #100 (S2.10.13e)
3. Executar 14a → smoke pós-deploy → 14b → smoke → 14c → smoke
4. Atualizar PRD para v2.3 (fora do escopo S2.10.14)

## Anexo — Confirmação por grep

Última execução em 2026-05-28:

```
$ rg -l "SheetsDb|sheets-db|sheetsDb" apps/api/src apps/web/src
apps/api/src/app.module.ts                                            (← S2.10.14b remove)
apps/api/src/modules/escalas/escalas.module.ts                        (← S2.10.14a)
apps/api/src/modules/escalas/escalas.service.ts                       (← S2.10.14a)
apps/api/src/modules/escalas-especiais/escalas-especiais.module.ts    (← S2.10.14a)
apps/api/src/modules/escalas-especiais/escalas-especiais.service.ts   (← S2.10.14a)
apps/api/src/modules/integracoes/integracoes.module.ts                (← S2.10.14a, dep removível)
apps/api/src/modules/integracoes/integracoes.service.test.ts          (← S2.10.14a)
apps/api/src/modules/integracoes/integracoes.service.ts               (apenas comentário)
apps/api/src/modules/notas-servico/notas-servico.module.ts            (← S2.10.14a)
apps/api/src/modules/notas-servico/notas-servico.service.ts           (← S2.10.14a)
apps/api/src/modules/sheets-db/                                       (← S2.10.14b: 6 arquivos)
```

**Total estimado:** 1.5 dia (3 sub-sprints de 0.5d cada) com revisão incremental.

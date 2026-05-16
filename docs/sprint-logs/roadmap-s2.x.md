# Roadmap S2.x — Pós-MVP / Hardening para produção

**Atualizado em:** 2026-05-16
**Tech Lead:** 2º SGT Heitor Barcellos Coelho — NF 3037509
**Contexto:** A Fase 1 do PRD (S0–S12) foi entregue. A série S2.x cobre estabilização, integrações operacionais e migração para banco persistente antes de iniciar Fase 2 (APH/IA).

---

## Status atual

| Sprint | Tema | PR | Status |
|--------|------|----|--------|
| S2.1 | Sheets-as-DB Foundation (SA + writer + bootstrap) | #45 | ✅ Merged |
| S2.2 | Sheets-DB Integration — dual-write Escalas/Especiais/NS | #47 | ✅ Merged |
| S2.3 | Re-import com bloqueios — Prévia/Serviço protege sobrescrita | #48 | ✅ Merged |
| S2.4 | Fix troca-senha em prod (cookie 3rd-party bloqueado → Bearer fallback) | #49 | ✅ Merged |
| S2.5 | Tela de carregamento animada com escalação por tempo | #50 | ✅ Merged |
| S2.6 | Status dashboard dos serviços externos na home | #51 | ✅ Merged |
| S2.7 | CRUD admin de usuários (`/configuracoes/usuarios`) | #52 | ✅ Merged |
| S2.8.1 | ISEO Hospitais — HIMABA em abas pareadas + visão calendário | #53 | ✅ Merged |
| S2.8.2 | Sheets-DB fonte primária + diff seletivo por dia + rename "Escala Mensal" | #54 | ✅ Merged |
| S2.8.3 | Trocas Autorizadas com NF direto + STATUS TROCA visível | #55 | ✅ Merged |
| **S2.8.4** | **Hotfix: Agenda/Mapa Força ↔ Efetivo após bootstrap Sheets-DB** | **#56** | **✅ Merged hoje (2026-05-16)** |

---

## Próximos sprints

### S2.9 — Hardening de produção + PWA (~3-4 dias)

**Motivação:** Habilitar uso institucional pelo Fiscal de Serviço em celular sem Wi-Fi confiável (RNF-021 mobile-first).

**Escopo:**

- **PWA**
  - `manifest.json` com ícones (192/512/maskable), nome "ARGUS CBMES", `display: standalone`, theme color `#1e3a8a` (cbmes-blue)
  - Service Worker via `vite-plugin-pwa` — cache-first para assets, network-first para API
  - Offline fallback page com mensagem "Sem conexão — abra novamente quando online"
  - Instalável no Android (Add to Home Screen) e iOS (Add to Home Screen via Safari)

- **Title + chunking**
  - `<title>` dinâmico por rota (hoje todas as páginas mostram "ARGUS CBMES")
  - Code-split via `React.lazy` + `Suspense` nas rotas pesadas (mapa-forca, parte-diaria, viaturas-detalhe)
  - Bundle atual: 759 kB → meta ≤ 400 kB no chunk principal

- **Observabilidade leve**
  - Sentry SDK opcional (gated por env var) no frontend e backend
  - Captura erros não-tratados + breadcrumbs de navegação
  - Sem PII (LGPD): NF como user.id, sem CPF/nome

- **Hardening API**
  - Rate limit já existe em login — estender para `/api/escalas/preview` (re-import abuse)
  - Helmet headers (CSP, X-Frame-Options, etc.) revisar
  - Error boundary global no frontend (página amigável em vez de tela branca)

**Arquivos críticos:**
- `apps/web/vite.config.ts` — `vite-plugin-pwa`
- `apps/web/public/manifest.json` (novo)
- `apps/web/public/icons/` (novo)
- `apps/web/src/App.tsx` — lazy routes
- `apps/web/src/components/ErrorBoundary.tsx` (novo)
- `apps/api/src/main.ts` — helmet config

**DoD:** Instalável no Android, abre offline, bundle principal ≤ 400 kB, Sentry capturando.

---

### S2.10 — Migração Supabase (~5-7 dias)

**Motivação:** Substituir armazenamento in-memory + Sheets-DB por Postgres persistente. Sheets-DB continua como espelho/cache para visualização institucional, mas a fonte da verdade passa a ser Supabase.

**Escopo:**

1. **Schema Prisma**
   - `User`, `Militar` (consolidado QDI+EFETIVO), `Viatura`, `EscalaMensal`, `EscalaEspecial`, `NotaServico`, `IdeoChecklist`, `TrocaAutorizada`, `Dispensa`, `IseoHospital`, `MapaForcaDiario`
   - Relations + indexes nos campos de filtro (data, nf, ano-mes)
   - Soft delete via `deletedAt` nas entidades editáveis

2. **Migrations**
   - `prisma migrate dev` para schema inicial
   - Seed script: lê do Sheets-DB atual e popula Postgres (one-shot)

3. **Refactor services**
   - Cada `*.service.ts` que hoje mantém `Map<>` em memória passa a usar Prisma
   - Mantém o dual-write para Sheets-DB (continua útil pra visualização institucional na Drive)
   - `onModuleInit` deixa de carregar de Sheets — Postgres é fonte primária; Sheets-DB vira write-only de novo

4. **RLS (Row Level Security) Supabase**
   - Política básica: usuário autenticado vê tudo da sua unidade (1ª Cia/1BBM)
   - Admin tem bypass
   - Anônimo não acessa nada

5. **Backup/restore**
   - Dump diário automatizado via Supabase scheduled function
   - Runbook em `docs/runbooks/` para restore

**Riscos:**
- Maior PR da série — tocar todos os módulos
- Estratégia: 1 PR por módulo (S2.10.1 schema+seed, S2.10.2 Auth+Users, S2.10.3 Cadastros, S2.10.4 Escalas, S2.10.5 Operacional)

**DoD:** Restart de backend não perde dados, Supabase dashboard mostra todas as tabelas populadas, RLS ativo, runbook de restore testado.

---

### S2.11 — Débito técnico de CI (~0,5 dia)

**Motivação:** Os 4 últimos PRs (S2.8.1, S2.8.2, S2.8.3, #56) mergeram com **CI vermelho** no step `Format check`. 81 arquivos pré-existentes em main violam `endOfLine: lf` do Prettier por causa de CRLF persistido no blob git (autocrlf Windows). Vercel sobe normalmente porque não roda format:check, mas CI verde é pré-requisito pra abrir mão do `--admin` no merge.

**Escopo:**

- Adicionar `.gitattributes` na raiz:
  ```
  * text=auto eol=lf
  *.{ps1,cmd,bat} text eol=crlf
  *.{png,jpg,jpeg,gif,ico,pdf,xlsx,xlsm,docx,zip} binary
  ```
- Renormalizar com `git add --renormalize .`
- Rodar `pnpm format` para canonicalizar todos os 306 warnings locais
- 1 commit grande "chore: normalize line endings + prettier global pass" — diff gigante mas funcionalmente vazio (apenas EOL + formatação)
- Adicionar `pnpm format:check` como pre-push hook (Husky) pra prevenir regressão

**DoD:** `pnpm format:check` verde local e CI; novo PR consegue merge sem `--admin`.

---

### S2.12 — Limpeza de débitos identificados durante S2.x (~1-2 dias)

**Backlog descoberto durante implementação:**

- **Diff seletivo por ato em Escala Especial** (adiado em S2.8.2 Parte D — hoje re-import substitui mês inteiro)
- **Bootstrap Sheets-DB tem dependência circular implícita** entre `escalas.service` e `sheets-db-serializers` (workaround atual: `parseMilitarCell` exportado). Considerar extrair `MilitarRefParser` para `packages/shared-types`
- **NomeMatcher silencia falha de NF** — quando NF está no efetivo mas posto/nome divergem, retorna o militar do NF (correto), mas não loga divergência. Adicionar warning estruturado
- **Round-trip não fiel**: `avisos`, `mergulho`, `salvamar` não são serializados no Sheets-DB (documentado em [sheets-db-serializers.ts:13-21](apps/api/src/modules/sheets-db/sheets-db-serializers.ts#L13-L21)). Após Supabase (S2.10) o XLSX deixa de ser canônico e isso precisa ser resolvido — provavelmente serializando esses campos em colunas extras ou tabelas anexas

---

## Sequência rígida

```
S2.9 (Hardening + PWA)
  → S2.11 (Débito CI)              ← pode ser feito em paralelo ou antes
  → S2.10 (Supabase, em sub-sprints)
  → S2.12 (Limpeza pós-Supabase)
  → Fase 2 (APH com IA generativa) — fora deste roadmap
```

**Recomendação:** rodar S2.11 ANTES de S2.10 para que o PR mega-diff de migração Postgres não seja contaminado por ruído de EOL/formatação. ~0,5 dia de investimento que reduz risco de revisão dos PRs grandes.

---

## Convenções para todos os sub-sprints

- 1 PR por sub-sprint (`S2.N.M`)
- Branch: `feat/s2.N.M-<slug>` ou `fix/<descricao>` para hotfixes
- DoD: typecheck + lint + tests + build verdes localmente
- CI: enquanto S2.11 não rodar, format:check ficará vermelho — Vercel SUCCESS é o gate de fato
- Sprint log em `docs/sprint-logs/s2.N.M.md` (quando o sprint tem decisão arquitetural relevante)
- ADR novo em `docs/adr/` quando muda contrato/integração

---

## Histórico de decisões consolidadas (S2.x)

| Decisão | Sprint | Onde |
|---------|--------|------|
| Service Account aprovada (rejeição anterior superada) | S2.1 | `docs/runbooks/google-sheets-db-setup.md` |
| Sheets-DB como espelho, depois fonte primária | S2.1 → S2.8.2 | ADR pendente |
| Dual-write fire-and-forget (não bloqueia API) | S2.2 | `sheets-db.service.ts` |
| Re-import com bloqueio por Prévia/Serviço já confirmado | S2.3 | `escalas.controller.ts` |
| Auth: Bearer fallback ao cookie httpOnly | S2.4 | `auth-context.tsx` + `auth.guard.ts` |
| ISEO HIMABA: 1º par = HPM, 2º par = HIMABA (fixo) | S2.8.1 | `iseo-hospitais-csv-parser.ts` |
| Bootstrap: Sheets-DB sempre vence; XLSX só se Sheets-DB vazio | S2.8.2 | `escalas.service.ts` |
| Trocas Autorizadas: NF direto da planilha elimina ambiguidade | S2.8.3 | `trocas-autorizadas-csv-parser.ts` |
| NomeMatcher: NF é chave primária quando preenchida | S2.8.4 | [nome-matching.ts:46-57](apps/api/src/modules/mapa-forca/nome-matching.ts#L46-L57) |

# Sprint S6c — Fix Efetivo NomeMatcher + suprimir OFICIAL DE DIA/PERITOS + cores status + reorganização modular UI

**Data:** 2026-05-10
**Foco:** 4 ajustes pré-S6d (entidade Unidade/Recurso configurável)
**Tech Lead:** 2º SGT Heitor Barcellos Coelho

> Sprint pequeno (~2,3d) entregando correções e reorganização visual antes de
> S6d (entidade Unidade/Recurso, ~3-4d).

## Critérios de Pronto S6c (DoD)

- [x] **F1** Flag `incluirEfetivoOrfao` em `mergeThreeSources/consolidate/getAll`.
      NomeMatcher da Prévia agora resolve militares só presentes no EFETIVO
      geral. Página `/cadastros/efetivo` continua filtrada (S6a-fix preservado).
- [x] **F2** `OFICIAL DE DIA` e `PERITOS` removidos de `RECURSOS_STAFF`
      (previa.service.ts) e `RECURSOS_VALIDOS` (mapa-forca-csv-parser.ts)
- [x] **F3** Paleta única em `lib/status-viatura-style.ts` aplicada em
      viaturas.tsx, previa.tsx (grade de viaturas), conferencia-viatura.tsx
- [x] **F4** Home reorganizado em 3 seções modulares: **Prontidão** (Prévia +
      Fiscais + IDEO), **Sargenteação** (Efetivo + Escalas + Especiais),
      **Logística** (Viaturas)
- [x] Tests: backend 207 → 211 (+4 cenários novos S6c/F1)
- [x] Pipeline: typecheck + lint + format + build verdes (211/211 tests)

## Entregas

### Backend (apps/api)

**F1 — Efetivo NomeMatcher (incluirEfetivoOrfao):**

- `apps/api/src/modules/efetivo/efetivo.service.ts`:
  - `mergeThreeSources(dados, qdi, efetivo, options)` ganha
    `options.incluirEfetivoOrfao` — quando true, NFs só do EFETIVO entram
    no merge.
  - `consolidate({ incluirEfetivoOrfao? })` propaga.
  - `getAll({ somente1aCia?, incluirEfetivoOrfao? })` aceita ambos os filtros
    independentemente.
  - `findByNf(nf)` agora usa `incluirEfetivoOrfao: true` internamente —
    página de detalhe `/cadastros/efetivo/:nf` resolve qualquer NF do EFETIVO.
- `apps/api/src/modules/efetivo/efetivo.service.test.ts` — 4 cenários novos
  cobrindo a flag (default sem órfão, com órfão, somente1aCia ignora
  incluirEfetivoOrfao, findByNf inclui órfão).
- `apps/api/src/modules/previa/previa.service.ts:84` — `getAll({
somente1aCia: false, incluirEfetivoOrfao: true })` para o NomeMatcher.

**F2 — Suprimir OFICIAL DE DIA + PERITOS:**

- `apps/api/src/modules/previa/previa.service.ts:34` — `RECURSOS_STAFF`
  reduzido a `['CHEFE DE OPERAÇÕES']`.
- `apps/api/src/modules/mapa-forca/mapa-forca-csv-parser.ts:30` —
  `RECURSOS_VALIDOS` perde `'OFICIAL DE DIA'` e `'PERITOS'`. Linhas com
  esses recursos são ignoradas no parse do CSV.
- Tests: `mapa-forca-csv-parser.test.ts` continua passando (não havia
  expectativa específica para esses recursos).

### Frontend (apps/web)

**F3 — Paleta única de cores de status:**

- `apps/web/src/lib/status-viatura-style.ts` (novo) — 3 paletas:
  - `STATUS_VIATURA_BADGE`: `bg-emerald-500/red-600/amber-500 text-white`
    (forte; uso em listas/cards)
  - `STATUS_VIATURA_CARD`: `border + bg-XXX-50 + text-XXX-900` (claro; uso
    em grid grande)
  - `STATUS_VIATURA_BG`: só background (uso em barras/dots)
- `apps/web/src/pages/viaturas.tsx` — `STATUS_BADGE_CLASS` aponta para a
  paleta importada.
- `apps/web/src/pages/previa.tsx` — grade de viaturas operacionais usa
  `STATUS_VIATURA_CARD` (border-2) + badge inline para BAIXADA/EMPRESTADA.
  Corrige também strings legadas (`operacional`/`baixada`/`reserva` →
  `DISPONIVEL`/`BAIXADA`/`EMPRESTADA`).
- `apps/web/src/pages/conferencia-viatura.tsx` — header com status atual
  agora é badge forte + label.

**F4 — Reorganização modular do home:**

- `apps/web/src/pages/home.tsx` — 3 seções com header colorido (border-l-4):
  - **Prontidão** (vermelho, `★ operacional`): Prévia (destaque) + Fiscais +
    IDEO + Conferências (info card sem link, "acesse via Prévia")
  - **Sargenteação** (azul): Efetivo + Escala Mensal + Escala Especial
  - **Logística** (âmbar): Viaturas
- Componentes auxiliares `<ModuloSection>`, `<CardLink>`, `<CardInfo>`
  inline no arquivo.
- Texto da sprint atualizado para apontar S6c → S6d.
- Layout mobile-first preservado (grid 2 colunas).

### Documentação

- `docs/sprint-logs/s6c.md` (este)
- **Sem ADR novo** (são fixes pequenos + reorganização visual; sem decisão
  arquitetural significativa)

## Verificação end-to-end

```bash
# 0. Restart backend
pnpm dev:api

# 1. Login
curl -X POST http://localhost:3000/auth/login -H "Content-Type: application/json" \
  -d '{"nf":"3037509","senha":"<senha>"}' -c /tmp/c.txt

# 2. Página /cadastros/efetivo continua filtrada (S6a-fix preservado)
curl "http://localhost:3000/efetivo?somente1aCia=true&page=1&pageSize=200" -b /tmp/c.txt \
  | jq '.items[] | select(.nf=="3269779" or .nf=="4544935")'
# Esperado: vazio (NÃO aparecem ALAN/ALINE)

# 3. NomeMatcher da Prévia resolve militares de qualquer canto
curl "http://localhost:3000/previa?data=2026-05-09" -b /tmp/c.txt \
  | jq '.inconsistencias | map(select(.tipo=="NF_NAO_RESOLVIDO")) | length'
# Esperado: número menor que antes do S6c

# 4. Prévia não tem mais OFICIAL DE DIA / PERITOS
curl "http://localhost:3000/previa?data=2026-05-09" -b /tmp/c.txt \
  | jq '[.composicaoMf[] | .recurso] | map(select(. == "OFICIAL DE DIA" or . == "PERITOS"))'
# Esperado: []

# 5. Detalhe de militar do EFETIVO sem subseção
curl "http://localhost:3000/efetivo/<NF-de-militar-só-no-EFETIVO>" -b /tmp/c.txt | jq
# Esperado: retorna o militar (antes retornava 404)

# 6. Pipeline
pnpm typecheck && pnpm lint && pnpm build
```

**Frontend (http://localhost:5173):**

- `/` (home) → 3 seções: **Prontidão** (vermelho, com Prévia em destaque),
  **Sargenteação** (azul), **Logística** (âmbar)
- `/cadastros/viaturas` → status com cores fortes (verde DISPONIVEL,
  vermelho BAIXADA, âmbar EMPRESTADA)
- `/previa?data=2026-05-09` → grade de viaturas com bordas coloridas
  fortes; sem cards "OFICIAL DE DIA" ou "PERITOS"
- `/servico/:data/conferencia-viatura/:vtrPrefixo` → header com badge de
  status colorido

## Achados durante a implementação

- **Inconsistência legada em `previa.tsx`:** o grid de viaturas operacionais
  ainda usava strings antigas (`operacional`/`baixada`/`reserva`) que não
  vinham mais do backend após S6a/ADR-009. F3 corrigiu de quebra.
- **`findByNf` precisava de incluirEfetivoOrfao:** página
  `/cadastros/efetivo/:nf` quebrava silenciosamente para militares só no
  EFETIVO (404). Agora resolve.
- **Conferências no menu:** ficou como `<CardInfo>` (não link) porque
  precisa de `:data` + `:vtrPrefixo` que são contextuais à Prévia. UX
  melhor que um link quebrado.
- **Cores fortes:** `bg-red-600` para BAIXADA (não `bg-red-500`) para
  contraste maior — viatura baixada precisa chamar atenção imediata.

## Métricas

- **Arquivos novos:** 2 (paleta de cores + sprint log)
- **Arquivos modificados:** 7 (efetivo.service.ts + test, previa.service.ts,
  mapa-forca-csv-parser.ts, viaturas.tsx, previa.tsx,
  conferencia-viatura.tsx, home.tsx)
- **Tests:** 207 (S6b) → **211** (S6c) — +4 cenários novos S6c/F1
- **Pipeline:** typecheck ✅ lint ✅ format ✅ build ✅ tests **211/211** ✅

## Próximo passo

- **S6d:** Entidade `Unidade` (1ª1º) + entidade `Recurso` configurável
  com seed hardcoded (ABTS_01..GUARDA + flags ativo/comporta_viatura/comporta_efetivo).
  Migra a whitelist `RECURSOS_VALIDOS` para entidade. Sem CRUD UI ainda
  (futuro S6e/S6f).
- **S5b:** Persistência Prisma+Supabase + deploy Vercel
- **S9:** Escrita real no MF (Puppeteer)
- **S10/S11:** Parte Diária

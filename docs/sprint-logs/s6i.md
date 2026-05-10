# Sprint S6i — IDEO realizado/não-realizado + texto institucional do Fiscal

**Data:** 2026-05-10
**Foco:** Item 2.2 da rodada S6h–S6l. Atestado de IDEO pelo Fiscal.
**Tech Lead:** 2º SGT Heitor Barcellos Coelho

> Segundo sprint da rodada (S6h ✅ entregue como PR #8). Adiciona o
> registro de IDEO realizado/não-realizado por tipo (ABTS/RESGATE) e gera
> o texto institucional do Fiscal para a Parte Diária.

## Critérios de Pronto S6i (DoD)

- [x] **F1** Schema `ideoStatusDoDiaSchema` (`tipo`, `realizada`,
      `motivoNaoRealizacao?`, `fiscalNf`, `geradoEm`) em
      `@argus/shared-types/src/ideo.ts` + helper
      `gerarTextoFiscalAtestadoIdeo()` em `previa.ts`.
- [x] **F2** `IdeoStatusService` (in-memory) + `IdeoStatusController`
      (`GET /ideo-status/:data`, `PUT /ideo-status/:data` com
      `@Roles('admin', 'fiscal', 'sargenteante')`).
- [x] **F3** `PreviaService.getPreviaDoDia()` injeta `IdeoStatusService` e
      inclui `ideoStatus[]` + `textoAtestadoIdeoFiscal` no payload da Prévia.
- [x] **F4** Página `/servico/:data/ideo` (frontend): 2 cards (ABTS, RESGATE)
      com toggle "realizada" + textarea de motivo + preview em tempo real do
      texto institucional. Botão "Atestar" salva no backend.
- [x] **F5** Link "✅ IDEO (atestar Fiscal)" no `ServicoCard` da Prévia
      (`/previa`), com badge "✓ texto do Fiscal pronto" quando texto
      gerado.
- [x] +11 testes novos (`IdeoStatusService` 6 + `gerarTextoFiscalAtestadoIdeo` 5).
      Backend 250 → **261 passing**.
- [x] Pipeline: typecheck + lint + format + build verdes.

## Texto institucional do Fiscal

Inspirado no exemplo dado pelo Tech Lead:

> "Eu, 2° SGT BM JÚLIO CÉSAR NOYA LOPES, NF 2981009, atesto que todos os
> equipamentos inspecionados estão em ESTADO DE PRONTIDÃO (condições de
> pronto emprego)"

**Caso A** (todos os tipos realizados): formato exato acima, com
`<posto> <nomeGuerra>` e `NF <nf>` do Fiscal cadastrado/calculado.

**Caso B** (algum não realizado): texto descritivo com tipo + motivo:

> "Eu, 2ºSGT BARCELLOS, NF 3037509, registro: IDEO RESGATE NÃO REALIZADA
> — Viatura emprestada."

Retorna `null` se faltar marcação de algum tipo (incompleto) ou se Fiscal
não está definido.

## Entregas

### Pacote shared-types

- `ideo.ts`: `ideoStatusDoDiaSchema` + `upsertIdeoStatusInputSchema`
  (refine: motivo obrigatório quando não realizada).
- `previa.ts`: campo `ideoStatus[]` + `textoAtestadoIdeoFiscal` no
  `previaDoDiaSchema`. Helper exportado `gerarTextoFiscalAtestadoIdeo()`.

### Backend (apps/api)

- `modules/ideo/ideo-status.service.ts` (novo): persistência in-memory
  por `data|tipo`. `upsert` zera `motivoNaoRealizacao` quando `realizada=true`.
- `modules/ideo/ideo-status.controller.ts` (novo): GET por data + PUT
  (atestar) com RBAC.
- `modules/ideo/ideo.module.ts`: registra novos provider/controller.
- `modules/previa/previa.service.ts`: injeta `IdeoStatusService`, calcula
  `fiscalParaTexto`, chama `gerarTextoFiscalAtestadoIdeo` e expõe
  `ideoStatus` + `textoAtestadoIdeoFiscal` no payload.

### Frontend (apps/web)

- `lib/api.ts`: `ideoStatusGet(data)` + `ideoStatusUpsert(data, input)`.
- `pages/servico-ideo.tsx` (novo, ~250 linhas): 2 cards
  (border emerald/amber/slate conforme estado) + toggle + textarea + botão
  "Atestar IDEO X". Preview em tempo real do texto institucional usando
  o helper compartilhado. Avisa quando Fiscal não está definido.
- `pages/previa.tsx`: card "✅ IDEO (atestar Fiscal)" no `ServicoCard` que
  ocupa as 2 colunas (`md:col-span-2`). Mostra "✓ texto do Fiscal pronto"
  quando o backend já gerou o texto.
- `router.tsx`: rota `/servico/:data/ideo` → `<ServicoIdeoPage />`.

### Tests

- `apps/api/src/modules/ideo/ideo-status.service.test.ts` (novo, +6 cenários):
  upsert ABTS, upsert não-realizada, zera motivo quando realizada=true,
  getByData filtra, idempotente por dia/tipo, reset por data.
- `apps/api/src/modules/previa/gerar-texto-fiscal.test.ts` (novo, +5
  cenários): null sem fiscal, null incompleto, caso A texto institucional,
  caso B com motivo, caso B sem motivo (fallback).

### Documentação

- `docs/sprint-logs/s6i.md` (este).
- **Sem ADR novo** (extensão do fluxo de Serviço; mantém ADR-012).

## Verificação end-to-end

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm build
pnpm --filter api test
# Esperado: 261 passing
```

**Manual (frontend, http://localhost:5173):**

1. **Iniciar Serviço** numa data com escala importada e Fiscal definido.
2. Clicar no card "✅ IDEO (atestar Fiscal)" no `ServicoCard` →
   abre `/servico/:data/ideo`.
3. **2 cards** (ABTS e RESGATE). Default: realizada=true.
4. Marcar **ABTS realizada** → click "Atestar IDEO ABTS" → card vira verde.
5. Desmarcar **RESGATE realizada** → textarea aparece com placeholder
   "Motivo da não realização da IDEO RESGATE (obrigatório)".
6. Tentar salvar sem motivo → erro "Motivo é obrigatório quando IDEO
   RESGATE não foi realizada".
7. Preencher motivo (ex.: "Viatura emprestada") → click "Atestar" →
   card vira amarelo.
8. **Preview** atualiza ao vivo com o texto institucional do Fiscal.
9. Voltar para `/previa?data=…` → card "✅ IDEO" mostra
   "✓ texto do Fiscal pronto".
10. **Não-fiscal/admin/sargenteante:** botões "Atestar" não aparecem;
    mensagem amarela explica.

## Achados durante a implementação

- **Helper compartilhado entre backend e frontend:** `gerarTextoFiscalAtestadoIdeo`
  vive em `@argus/shared-types/previa.ts` para ser usado em 3 lugares: PD
  (S10/S11), payload da Prévia (PreviaService) e preview ao vivo no
  frontend (ServicoIdeoPage). Garante 1 fonte de verdade.
- **Refine no Zod:** `upsertIdeoStatusInputSchema` valida no schema que
  `motivoNaoRealizacao` é obrigatório quando `realizada=false`. UI também
  valida no submit pra dar mensagem amigável antes de bater no backend.
- **Tests de helper compartilhado:** `shared-types` não tem vitest
  configurado, então o test do helper vive em `apps/api/src/modules/previa/
gerar-texto-fiscal.test.ts` importando do `@argus/shared-types`. Padrão
  já usado para outros helpers exportados.
- **Layout do card no ServicoCard:** o card de IDEO ocupa as 2 colunas
  (`md:col-span-2`) por baixo dos cards Conferência Equipe + Conferência
  Viaturas. Mantém o foco no fluxo crítico (conferências) acima.

## Métricas

- **Arquivos novos:** 5
  - `apps/api/src/modules/ideo/ideo-status.service.ts`
  - `apps/api/src/modules/ideo/ideo-status.controller.ts`
  - `apps/api/src/modules/ideo/ideo-status.service.test.ts`
  - `apps/api/src/modules/previa/gerar-texto-fiscal.test.ts`
  - `apps/web/src/pages/servico-ideo.tsx`
- **Arquivos modificados:** 8
  - shared-types (`ideo.ts`, `previa.ts`)
  - backend (`ideo.module.ts`, `previa.service.ts`,
    `previa.service.test.ts`)
  - frontend (`lib/api.ts`, `pages/previa.tsx`, `router.tsx`)
- **Tests:** 250 (S6h) → **261** (S6i) — +11 cenários novos
- **Pipeline:** typecheck ✅ lint ✅ format ✅ build ✅
  tests **261/261** ✅

## Próximo passo

- **S6j:** Dispensas refatoradas + lista canônica I–VIII + perfil militar (~2d).
- **S6k:** Atestados (módulo + integrações) (~2d).
- **S6l:** Notas de Serviço CRUD manual + ajuste pré-turno (~2d).
- **S6m (futuro):** Parser PDF de NS.
- **S5b:** Persistência Prisma+Supabase + deploy Vercel.

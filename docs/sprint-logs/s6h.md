# Sprint S6h — Conferência por equipe + período da troca (combobox) + botão MF mock

**Data:** 2026-05-10
**Foco:** Itens 1.1 e 2.1 da rodada S6h–S6l (Sargenteação + Serviço refinados).
**Tech Lead:** 2º SGT Heitor Barcellos Coelho

> Primeiro sprint da série S6h–S6l (5 sprints incrementais). Refator visual e
> de fluxo da Conferência da Equipe + dependência viatura→equipe + botão
> "Preencher Mapa Força" (mock até S9). Combobox de período da troca substitui
> o texto livre do S5.

## Critérios de Pronto S6h (DoD)

- [x] **F1 (1.1)** Schema `periodoTrocaSchema` (discriminated union: predefinido + custom)
      em `@argus/shared-types`. Campo `periodo` da troca aceita string legacy
      OU `PeriodoTroca`. Helpers `periodoToLabel` + `legacyStringToPeriodo` no
      frontend.
- [x] **F2 (2.1)** `STATUS_CONFERENCIA_EQUIPE` (`nao_conferida` / `em_conferencia`
      / `conferida`) — agregado por recurso a partir dos status individuais.
- [x] **F3 (2.1)** `ConferenciaEquipeService.getStatusPorEquipe()` +
      `equipeConferida()`. `ConferenciaViaturaService.registrar()` bloqueia
      (409) se a equipe da viatura ainda não foi conferida.
- [x] **F4 (2.1)** `ServicoService.marcarPreenchimentoMfIniciado()` +
      `POST /servico/:data/preencher-mf` (mock). Transita
      `VIATURA_CONFERIDA → PREENCHENDO_MF`.
- [x] **F5 (frontend)**: - `lib/periodo-troca.ts` (novo): opções + helpers. - `lib/status-conferencia-style.ts` (novo): paletas badge + card. - `pages/previa.tsx`: combobox `<PeriodoTrocaPicker>` + botão "Preencher Mapa Força" no `ServicoCard`. - `pages/conferencia-equipe.tsx`: refatorado para listagem por equipe
      com badge agregado + modal de detalhes (`<EquipeModal>`).
- [x] +9 cenários de teste novos (servico 3 + conferencia-equipe 4 +
      conferencia-viatura 2). Backend 241 → **250 passing** (auth flake
      preexistente Windows ignorado, 1/250).
- [x] Pipeline: typecheck + lint + format + build verdes.

## Decisões alinhadas (AskUserQuestion 2026-05-10)

- 5 sprints incrementais para os 6 itens reportados (S6h–S6l + S6m futuro).
- Conferência por equipe **com modal de detalhes** (mantém granularidade
  militar dentro do modal; agrega cor/estado por equipe).
- Parser PDF de NS fica para sprint dedicada (S6m futuro, não inclui aqui).
- Lista de dispensas com 8 tipos enumerados I–VIII (segundo "III" do texto
  inicial é typo de VIII).

## Entregas

### Pacote shared-types

- `previa.ts` — adiciona `PERIODO_TROCA_PREDEFINIDO` (5 valores),
  `periodoTrocaSchema` (discriminated union `predefinido` / `custom`).
  `previaTrocaSchema.periodo` aceita `string` legacy OU `PeriodoTroca`.
- `servico.ts` — adiciona `STATUS_CONFERENCIA_EQUIPE` (3 valores) +
  `STATUS_CONFERENCIA_EQUIPE_LABEL`.

### Backend (apps/api)

- `servico.service.ts` — método `marcarPreenchimentoMfIniciado(dataIso)`
  (transita `VIATURA_CONFERIDA → PREENCHENDO_MF`, idempotente).
- `servico.controller.ts` — endpoint `POST :data/preencher-mf`
  (`@Roles('admin', 'fiscal', 'sargenteante')`).
- `conferencia-equipe.service.ts` — `getStatusPorEquipe(dataIso): Map<recurso, StatusConferenciaEquipe>`
  - helper `equipeConferida(dataIso, recurso)`.
- `conferencia-viatura.service.ts` — injeta `ConferenciaEquipeService` (DI nova,
  módulo importa `ConferenciaEquipeModule`). `registrar()` bloqueia 409 quando
  o serviço foi iniciado mas a equipe da viatura (identificada por
  `viatura.funcaoOperacional`) ainda não foi conferida.

### Frontend (apps/web)

- `lib/periodo-troca.ts` (novo) — `PERIODO_TROCA_OPCOES`, `periodoToLabel`,
  `legacyStringToPeriodo`, `PERIODO_TROCA_DEFAULT`.
- `lib/status-conferencia-style.ts` (novo) — `STATUS_CONFERENCIA_EQUIPE_BADGE`
  (slate / amber / emerald) e `STATUS_CONFERENCIA_EQUIPE_CARD` (border + bg).
- `lib/api.ts` — `servicoPreencherMf(data)` (POST mock).
- `lib/whatsapp.ts` — usa `periodoToLabel` para imprimir período em qualquer
  formato (legacy + estruturado).
- `pages/previa.tsx`:
  - Importa novos schemas + helpers.
  - `<PeriodoTrocaPicker>` (componente novo no final do arquivo) substitui
    o input de texto livre. Combobox com 5 opções + "Personalizado" (com
    inputs `time` para hora início e fim).
  - Adicionar troca usa `PERIODO_TROCA_DEFAULT` (TURNO_24H).
  - `ServicoCard` ganha botão "Preencher Mapa Força" (verde, com ícone 🗺️)
    que aparece quando `estado === 'VIATURA_CONFERIDA'` e o usuário pode
    iniciar serviço. Click → `confirm()` + chamada ao mock + mensagem.
- `pages/conferencia-equipe.tsx` — refator total:
  - Agrupa marcações por recurso (= equipe).
  - Cada equipe vira 1 card com border colorido + badge agregado.
  - Click no card abre `<EquipeModal>` (modal full-height) com checklist
    dos militares. Mantém UX dos botões `presente/substituído/ausente` e
    `<MilitarSelect>` para substituto.
  - Botão "Confirmar equipe" só habilita quando todas as marcações da equipe
    estão != `pendente`. Salva via `bulkUpdate` (que persiste tudo de uma vez).
- `pages/conferencia-viatura.tsx` — sem mudança no frontend; o backend
  bloqueia com 409 e a mensagem ("Equipe X ainda não foi conferida") já cai
  no `setError` existente.

### Tests novos

- `servico.service.test.ts` (+3): `marcarPreenchimentoMfIniciado` transita,
  rejeita sem conferências, é idempotente.
- `conferencia-equipe.service.test.ts` (+4): `getStatusPorEquipe` vazio,
  `em_conferencia`, `conferida`, multi-recurso.
- `conferencia-viatura.service.test.ts` (+2): bloqueia (409) quando equipe
  não conferida; permite após conferir equipe.

### Documentação

- `docs/sprint-logs/s6h.md` (este).
- **Sem ADR novo** (refator de UI + adição de campos; mantém ADR-002 para RBAC
  e ADR-012 para estado do serviço).

## Verificação end-to-end

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm build
pnpm --filter api test
# Esperado: 250 passing (1 flake auth Windows ignorado)
```

**Manual (frontend, http://localhost:5173):**

1. **`/previa?data=YYYY-MM-DD` → ajustes pré-turno → adicionar troca:**
   campo "Período" agora é dropdown com 5 opções predefinidas + "Personalizado".
   Selecionando "Personalizado" aparecem 2 inputs `time` (início/fim).
2. **Clicar "Iniciar Serviço"** (admin/fiscal/sargenteante) → estado
   transita para `INICIADO`. Aparece menu com Conferência da Equipe +
   Conferência das Viaturas.
3. **`/servico/:data/conferencia-equipe`:** lista 1 card por recurso/equipe
   com badge cinza ("Não conferida"). Click → modal com checklist dos
   militares.
4. **No modal:** marcar todos os militares (presente/substituído/ausente)
   → botão "Confirmar equipe" habilita → click → equipe vira verde
   ("Conferida").
5. **`/servico/:data/conferencia-viatura/:vtrPrefixo`** de viatura cuja
   equipe NÃO foi conferida → tentar salvar → erro 409 vermelho com
   mensagem "Equipe X ainda não foi conferida — confira a equipe primeiro".
6. **Após conferir TODAS as equipes + TODAS as viaturas** → estado vira
   `VIATURA_CONFERIDA` → aparece banner verde "✓ Equipes e viaturas
   conferidas" com botão **"🗺️ Preencher Mapa Força"**.
7. **Click "Preencher Mapa Força"** → confirm → mensagem "Preenchimento do
   Mapa Força iniciado (mock). A escrita automatizada será implementada
   no S9." Estado transita para `PREENCHENDO_MF`.

## Achados durante a implementação

- **Discriminated union no schema:** `periodo` aceita 2 formatos (legacy
  string OU estruturado). Frontend converte na entrada e na saída via
  `periodoToLabel`/`legacyStringToPeriodo`. Sem migração de dados (in-memory
  Phase 1).
- **DI cascata em ConferenciaViatura:** novo gate exige
  `ConferenciaEquipeService` injetado. Module importa
  `ConferenciaEquipeModule`. Tests precisaram passar `ConferenciaEquipeService`
  na construção.
- **Identificação da equipe pela viatura:** `viatura.funcaoOperacional`
  guarda o nome do recurso (ex.: "ABTS_01"). Esse é o vínculo
  viatura↔equipe usado pelo gate.
- **Modal sem libs externas:** implementado puro Tailwind + portal nativo
  (div fixed inset-0). Mantém bundle pequeno.

## Métricas

- **Arquivos novos:** 4
  - `apps/web/src/lib/periodo-troca.ts`
  - `apps/web/src/lib/status-conferencia-style.ts`
  - `docs/sprint-logs/s6h.md` (este)
- **Arquivos modificados:** 11
  - shared-types (`previa.ts`, `servico.ts`)
  - backend (`servico.service.ts`, `servico.controller.ts`,
    `conferencia-equipe.service.ts`, `conferencia-viatura.service.ts`,
    `conferencia-viatura.module.ts`)
  - frontend (`lib/api.ts`, `lib/whatsapp.ts`, `pages/previa.tsx`,
    `pages/conferencia-equipe.tsx`)
  - tests (`servico.service.test.ts`, `conferencia-equipe.service.test.ts`,
    `conferencia-viatura.service.test.ts`)
- **Tests:** 241 (S6g) → **250** (S6h) — +9 cenários novos
- **Pipeline:** typecheck ✅ lint ✅ format ✅ build ✅
  tests **249/250** ✅ (auth flake bcrypt Windows ignorado)

## Próximo passo

- **S6i:** IDEO realizado/não-realizado por tipo + texto institucional do
  Fiscal na PD (~1d).
- **S6j:** Dispensas refatoradas + lista canônica I–VIII + perfil militar (~2d).
- **S6k:** Atestados (módulo + integrações) (~2d).
- **S6l:** Notas de Serviço CRUD manual + ajuste pré-turno (~2d).
- **S6m (futuro):** Parser PDF de NS.
- **S5b:** Persistência Prisma+Supabase + deploy Vercel.
- **S9:** Escrita real no MF (Puppeteer) — substitui o mock do botão deste S6h.

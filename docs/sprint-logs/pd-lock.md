# PD Lock — Finalizar / Reabrir Parte Diária

**Data:** 2026-05-11
**Tipo:** Pequena feature de "fechamento" da Parte Diária (S10/S11)
**Branch:** `feat/pd-lock`
**Tech Lead:** 2º SGT Heitor Barcellos Coelho

## Motivação

Depois do Fiscal preencher a Parte Diária e baixar o `.docx` final, o
documento precisa ser **congelado** para evitar edições acidentais
pós-assinatura/envio. Isso fecha o ciclo iniciado em S10/S11.

## Comportamento

- **Estado normal** (default): PD editável por `admin` e `fiscal`.
- **`POST /parte-diaria/:data/finalizar`** (RBAC: admin, fiscal):
  registra `finalizadoEm` + `finalizadoPorNf`. A partir daí, qualquer
  `PUT /parte-diaria/:data` lança **409 Conflict**.
- **`POST /parte-diaria/:data/reabrir`** (RBAC: **admin only**): limpa
  o lock. PD volta editável.
- O `.docx` (GET `:data/docx`) **continua funcionando** mesmo
  finalizada — leitura é sempre permitida.
- O rascunho continua sendo derivado on-the-fly da Prévia; o lock só
  bloqueia `salvar`/`reabrir`.

## Critérios de Pronto (DoD)

- [x] **F1** Schema `parteDiariaSchema`: 2 campos novos
      `finalizadoEm: string | null`, `finalizadoPorNf: string | null`
      (defaults `null`).
- [x] **F2** `ParteDiariaService`:
      - `lockByData: Map<string, {finalizadoEm, finalizadoPorNf}>`.
      - `finalizar(data, nf)`, `reabrir(data)`.
      - `salvar()` lança `ConflictException` se locked.
      - `get()` sempre devolve os campos `finalizado*` (null quando
        sem lock).
      - `reset()` limpa lock também.
- [x] **F3** REST:
      - `POST /parte-diaria/:data/finalizar` (admin/fiscal).
      - `POST /parte-diaria/:data/reabrir` (admin only).
- [x] **F4** Frontend `/parte-diaria`:
      - Banner verde **"✓ Parte Diária FINALIZADA"** com NF e data
        quando locked.
      - Botão **"Finalizar PD"** (admin/fiscal) na toolbar.
      - Botão **"Reabrir PD"** (admin only) quando locked.
      - Todos os inputs editáveis ficam `disabled` quando locked
        (via `podeEditar = isFiscalOuAdmin && !finalizada`).
- [x] **F5** Tests +2 cenários: `finalizar → salvar 409`; `reabrir
      limpa lock + salvar volta a funcionar`.
- [x] Backend 311 → **314 passing** (1 bcrypt flake preexistente).
- [x] Pipeline: typecheck + lint + format + build verdes.

## Arquivos críticos

**Novo (1):**

- [docs/sprint-logs/pd-lock.md](docs/sprint-logs/pd-lock.md)

**Modificados (5):**

- [packages/shared-types/src/parte-diaria.ts](packages/shared-types/src/parte-diaria.ts)
- [apps/api/src/modules/parte-diaria/parte-diaria.service.ts](apps/api/src/modules/parte-diaria/parte-diaria.service.ts)
- [apps/api/src/modules/parte-diaria/parte-diaria.controller.ts](apps/api/src/modules/parte-diaria/parte-diaria.controller.ts)
- [apps/api/src/modules/parte-diaria/parte-diaria.service.test.ts](apps/api/src/modules/parte-diaria/parte-diaria.service.test.ts)
- [apps/web/src/lib/api.ts](apps/web/src/lib/api.ts)
- [apps/web/src/pages/parte-diaria.tsx](apps/web/src/pages/parte-diaria.tsx)

## Verificação

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm build
pnpm --filter api test                # 311 → 314 (1 bcrypt flake)
```

**Manual:**

1. Persona "HEITOR" (admin+fiscal). `/parte-diaria?data=2026-05-04`.
2. Editar qualquer texto + Salvar (funciona).
3. **Finalizar PD** → confirm → banner verde aparece, botão "Salvar"
   some, todos os campos editáveis ficam read-only.
4. Tentar editar (textarea, KM, etc.) → não permite (`disabled`).
5. **Reabrir PD** (botão amarelo) → banner some, edição volta.
6. Persona "MARIANE" (fiscal-only): finaliza, mas **não vê o botão
   Reabrir** (admin only).
7. Backend direto: `curl -X PUT /parte-diaria/.../...` quando locked
   → 409.

## Métricas

- **Tests:** 311 (S8) → **314** (+3 cenários: 2 PD lock + 1 reset
  atualizado para limpar lock).
- **Pipeline:** typecheck ✅ lint ✅ format ✅ build ✅
  tests **314/315** ✅ (1 bcrypt flake)

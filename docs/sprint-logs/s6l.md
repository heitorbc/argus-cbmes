# Sprint S6l — Notas de Serviço (CRUD manual + ajuste pré-turno)

**Data:** 2026-05-10
**Foco:** Item 1.2 da rodada S6h–S6l (último da série). Entidade
NotaServico canônica + CRUD manual + integração Prévia. Parser PDF fica
para S6m (sprint dedicado).
**Tech Lead:** 2º SGT Heitor Barcellos Coelho

> Quinto e último sprint da rodada S6h–S6l (S6h ✅ PR #8, S6i ✅ PR #9,
> S6j ✅ PR #10, S6k ✅ PR #11). Encerra a sequência de
> "Sargenteação avançada + Serviço refinado".

## Critérios de Pronto S6l (DoD)

- [x] **F1** `notaServicoSchema` (id, codigo, descricao, data, horaInicio,
      horaFim, viaturaPrefixo?, militaresNfs[], observacoes?) +
      create/update inputs em `@argus/shared-types/nota-servico.ts`.
- [x] **F2** `previaNotaServicoSchema` refatorado: ganha `notaServicoId`,
      `horaInicio`, `horaFim`, `viaturaPrefixo`, `militares[]` (com nome
      formatado), `observacoes`. Campo `descricao` opcional preservado
      como compat com S5.
- [x] **F3** `NotasServicoService` (in-memory) com CRUD +
      `listDoDia` + `createOrConflict` (rejeita duplicata `codigo+data`).
- [x] **F4** `NotasServicoController` REST com RBAC (POST aceita
      admin/sargenteante/fiscal — 2 fluxos: módulo + ajuste pré-turno).
- [x] **F5** `PreviaService` injeta `NotasServicoService` e popula
      `previa.notasServico` com `listDoDia(data)` enriquecido com nome
      dos militares. Substitui `ajustes.notasServico` legado.
- [x] **F6** Página `/cadastros/notas-servico` (Sargenteação) com CRUD
      admin: combobox de viatura (filtra DISPONIVEL), seleção múltipla
      de militares via `MilitarSelect`, validação de obrigatórios.
- [x] **F7** `<NotasServicoFieldset>` no ajuste pré-turno da Prévia:
      lista NS do dia + form inline para cadastrar via API direta.
- [x] **F8** Home: card "📋 Notas de Serviço" na seção Sargenteação.
- [x] +8 cenários de teste novos (`NotasServicoService`).
      Backend 278 → **286 passing**.
- [x] Pipeline: typecheck + lint + format + build verdes.

## Entregas

### Pacote shared-types

- `nota-servico.ts` (novo): entidade + create/update inputs com validação
  de hora (HH:MM) e data (YYYY-MM-DD).
- `previa.ts`: `previaNotaServicoSchema` refatorado para incluir os novos
  campos opcionais (compat com formato antigo `{codigo, descricao}`).
- `index.ts`: re-exporta `nota-servico.js`.

### Backend (apps/api)

- `modules/notas-servico/notas-servico.service.ts` (novo): CRUD in-memory
  - `listDoDia` + `createOrConflict`. Retorna ordenado por `data desc`,
    `horaInicio asc` para a UI.
- `modules/notas-servico/notas-servico.controller.ts` (novo): REST com
  RBAC.
- `modules/notas-servico/notas-servico.module.ts` (novo).
- `modules/notas-servico/notas-servico.service.test.ts` (novo, +8
  cenários).
- `modules/previa/previa.service.ts`: injeta `NotasServicoService` e
  popula `previa.notasServico` com formato enriquecido (substitui
  `ajustes.notasServico` antigo).
- `modules/previa/previa.module.ts`: importa `NotasServicoModule`.
- `app.module.ts`: registra `NotasServicoModule`.

### Frontend (apps/web)

- `lib/api.ts`: `notasServicoList`, `notasServicoCreate`,
  `notasServicoUpdate`, `notasServicoRemove`.
- `pages/notas-servico.tsx` (novo, ~430 linhas): CRUD admin com filtro
  por data, combobox viatura (DISPONIVEL), seleção múltipla de
  militares via `MilitarSelect`, badge código + descrição.
- `pages/previa.tsx`: substitui o `<fieldset Notas de Serviço>` antigo
  por `<NotasServicoFieldset>` (componente novo no fim do arquivo).
  Lista NS do dia read-only + form inline com viatura + militares.
- `pages/home.tsx`: card "📋 Notas de Serviço" em Sargenteação.
- `router.tsx`: rota `/cadastros/notas-servico` → `<NotasServicoPage />`.

### Documentação

- `docs/sprint-logs/s6l.md` (este).

## Verificação end-to-end

```bash
pnpm typecheck && pnpm lint && pnpm format:check && pnpm build
pnpm --filter api test
# Esperado: 286 passing
```

**Manual (frontend, http://localhost:5173):**

1. **Home (admin/sarg/fiscal):** seção Sargenteação tem card
   "📋 Notas de Serviço".
2. **`/cadastros/notas-servico`:** filtro por data. "+ Nova NS" → form
   com código (NS077), descrição, data, horários, viatura (combobox de
   disponíveis), múltiplos militares via `MilitarSelect`, observações.
3. Tentar criar duplicata `(NS077, 2026-05-10)` → 409 com mensagem.
4. **`/previa?data=YYYY-MM-DD`:** seção "Ajustes pré-turno" → fieldset
   "Notas de Serviço do dia" lista NS do dia + "+ Cadastrar NS" abre
   form inline.

## Achados durante a implementação

- **Schema previa.notasServico backward-compat:** `descricao` opcional
  manteve compat com testes antigos do S5. Frontend e backend usam os
  novos campos (`notaServicoId`, `horaInicio`, etc.) sempre que
  disponíveis.
- **`previaService.notasServico` deixou de derivar de
  `AjustesPreviaService`:** agora vem de `NotasServicoService.listDoDia`.
  O campo `ajustes.notasServico` continua no schema legado mas é
  ignorado na resposta da Prévia.
- **Combobox de viatura filtra status `BAIXADA`:** garante que NS não
  pode ser atribuída a viatura indisponível.
- **Seleção múltipla de militares:** usa o mesmo `MilitarSelect` dos
  outros formulários (Dispensas, Atestados) com chips removíveis.

## Métricas

- **Arquivos novos:** 5
  - `packages/shared-types/src/nota-servico.ts`
  - `apps/api/src/modules/notas-servico/{service,controller,module,service.test}.ts`
  - `apps/web/src/pages/notas-servico.tsx`
- **Arquivos modificados:** 9
  - shared-types (`previa.ts`, `index.ts`)
  - backend (`app.module.ts`, `previa/previa.module.ts`,
    `previa/previa.service.ts`, `previa/previa.service.test.ts`)
  - frontend (`lib/api.ts`, `pages/home.tsx`, `pages/previa.tsx`,
    `router.tsx`)
- **Tests:** 278 (S6k) → **286** (S6l) — +8 cenários novos
- **Pipeline:** typecheck ✅ lint ✅ format ✅ build ✅
  tests **286/286** ✅

## Encerramento da rodada S6h–S6l

| Sprint  | Item                                                              | PR      | Tests       |
| ------- | ----------------------------------------------------------------- | ------- | ----------- |
| S6h     | 1.1 período combobox + 2.1 conferência por equipe + botão MF mock | #8      | 241→250     |
| S6i     | 2.2 IDEO realizado/não-realizado + texto Fiscal                   | #9      | 250→261     |
| S6j     | 1.4 Dispensas refatoradas + lista canônica I-VIII + perfil        | #10     | 261→271     |
| S6k     | 1.3 Atestados médicos (módulo + integrações)                      | #11     | 271→278     |
| **S6l** | **1.2 Notas de Serviço CRUD manual**                              | **#12** | **278→286** |

Total acumulado: **+45 testes** (241 → 286), 5 PRs incrementais, todos
com pipeline verde. Pronto para encadear S6m (parser PDF) ou S5b
(persistência Supabase).

## Próximo passo

- **S6m (futuro):** Parser PDF de NS — extrai data/hora/viatura/
  militares dos arquivos `data/Nota de Serviço/NS*.pdf` e popula a
  entidade NotaServico via API.
- **S5b:** Persistência Prisma+Supabase + deploy Vercel.
- **S9:** Escrita real no MF (Puppeteer).
- **S10/S11:** Parte Diária (consome composicaoMf + ideoStatus +
  dispensas + atestados + notasServico + alterações diversas).

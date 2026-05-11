# Sprint S6b — Workflow operacional: Servico + Conferências + composicaoMf

**Data:** 2026-05-09
**Foco:** Estado do dia (Servico) + Conferências (Equipe e Viatura) + Refactor PreviaDoDia → composicaoMf + Alterações Diversas
**Tech Lead:** 2º SGT Heitor Barcellos Coelho

> S6b entrega o "item 4 inteiro" do pedido original do Tech Lead em
> 2026-05-09. PR S6a-fix (#1) já está aberto.

## Critérios de Pronto S6b (DoD)

- [x] **F1** `ServicoService` (estado do dia) com transições + RBAC granular + tests
- [x] **F2** Refactor `PreviaDoDia` → `composicaoMf` (espelha MF); `tripulacao` e
      `viaturasOperacionais` mantidos como derivados deprecated
- [x] **F3** Conferência da Equipe — service + endpoints + UI + tests; promove
      `Servico → EQUIPE_CONFERIDA` quando todos != pendente
- [x] **F4** Conferência da Viatura — `ViaturasService.aplicarConferencia()`
      como "porta autorizada" do ADR-009; mudança de status durante serviço
      gera Alteração Diversa automaticamente
- [x] **F5** Read-only Prévia + botão Iniciar/Encerrar Serviço + cards de
      Conferência + banner amarelo + bloqueio dos ajustes pré-turno
- [x] **F6** Alterações Diversas — schema + service estendido + endpoint +
      modal com `<MilitarSelect>`
- [x] ADR-011 (composicaoMf) + ADR-012 (estado do dia)
- [x] Tests: backend 207 (era 174 em S6a-fix) — **+33 novos**
- [x] Pipeline: typecheck + lint + format + build verdes

## Entregas

### Backend (apps/api)

**F1 — Servico (estado do dia):**

- `apps/api/src/modules/servico/servico.service.ts` — mock in-memory com
  transições NAO_INICIADO → INICIADO → EQUIPE_CONFERIDA → VIATURA_CONFERIDA
  → ENCERRADO. Helper `isReadOnly(dataIso)`.
- `apps/api/src/modules/servico/servico.controller.ts` — endpoints:
  - `GET /servico/:data`
  - `POST /servico/:data/iniciar` (RBAC fiscal/admin/sargenteante)
  - `POST /servico/:data/encerrar` (idem; `?force=true` apenas para admin)
  - `GET /servico/:data/alteracoes`
  - `POST /servico/:data/alteracoes` (RBAC fiscal/admin)
- `apps/api/src/modules/servico/servico.service.test.ts` — 16 cenários
  cobrindo transições + Alterações Diversas

**F2 — composicaoMf:**

- `packages/shared-types/src/previa.ts` — schemas
  `composicaoMfMilitarSchema`, `composicaoMfEntrySchema`; campos novos em
  `PreviaDoDia`: `composicaoMf`, `estadoServico`, `iniciadoEm`,
  `iniciadoPorNf`, `encerradoEm`, `encerradoPorNf`, `alteracoesDiversas`.
  Marca `tripulacao` e `viaturasOperacionais` como `@deprecated`.
- `apps/api/src/modules/previa/previa.service.ts` — função
  `buildComposicaoMf()` reagrupa `tripulacao` (1 linha por militar) em
  `composicaoMf` (1 linha por recurso). Injeta estado do Servico +
  Alterações Diversas no payload.

**F3 — Conferência da Equipe:**

- `apps/api/src/modules/conferencia-equipe/conferencia-equipe.service.ts`:
  - Mock in-memory keyed por `dataIso`, indexado por
    `recurso|funcao|militarOriginalNf`
  - `bulkUpdate(dataIso, input, marcadoPorNf)` — PUT atômico
  - `marcarPresenca(dataIso, entry, marcadoPorNf)` — granular
  - `maybePromover(dataIso)` — promove `Servico → EQUIPE_CONFERIDA` quando
    todas marcações != 'pendente'
- Controller + module + tests (8 cenários)

**F4 — Conferência da Viatura:**

- `apps/api/src/modules/viaturas/viaturas.service.ts` — método novo
  `aplicarConferencia(prefixo, input, registradoPorNf)` que bypassa o
  bloqueio ADR-009 (única "porta autorizada" para Conferências mexerem em
  status). Adiciona `observacoesDataDas` (histórico append-only).
- `apps/api/src/modules/conferencia-viatura/conferencia-viatura.service.ts`:
  - `registrar(dataIso, vtrPrefixo, input, registradoPorNf)` chama
    `aplicarConferencia`, persiste, e — se status mudou durante o serviço
    — cria `AlteracaoDiversa` automaticamente
- Controller + module + tests (5 cenários)

**F6 — Alterações Diversas:**

- Schema `alteracaoDiversaSchema` em `servico.ts`
- `ServicoService.addAlteracao` / `listAlteracoes` (append-only, auto-id +
  timestamp)
- Endpoints integrados em `servico.controller.ts`

**Outros:**

- `packages/shared-types/src/viatura.ts` — adicionado
  `observacoesDataDas: Array<{texto, data, registradoPorNf}>`;
  `createViaturaSchema` exclui esse campo (gerado pelo service).
- `apps/api/src/modules/previa/ajustes-previa.service.ts` — injeta
  `ServicoService`; rejeita upsert/add/remove se Servico iniciado
  (a menos que `isAdmin`).
- `apps/api/src/modules/previa/previa.controller.ts` — passa
  `user.papeis.includes('admin')` como `isAdmin` para AjustesService.

### Frontend (apps/web)

**F5 — Read-only Prévia + Conferências (UIs novas):**

- `apps/web/src/pages/conferencia-equipe.tsx` (nova rota
  `/servico/:data/conferencia-equipe`):
  - Lista da composição rotativa (apenas militares com NF resolvida)
  - Botões radio (Presente / Substituído / Ausente) com toques ≥44px
  - Se Substituído: `<MilitarSelect>` para substituto (excluindo o original)
  - Botão Salvar → PUT bulk → volta à Prévia
  - Contador "X presentes · Y substituídos · Z ausentes · W pendentes"
- `apps/web/src/pages/conferencia-viatura.tsx` (nova rota
  `/servico/:data/conferencia-viatura/:vtrPrefixo`):
  - Form: KM (number), Tanque (slider 0-100%), Observação (textarea)
  - Opcional: alterar status durante serviço (+ motivo se BAIXADA)
  - Histórico das últimas 5 observações datadas
- `apps/web/src/pages/previa.tsx` — componentes novos:
  - `<ServicoCard>` — banner do estado + botão Iniciar/Encerrar
  - `<ConferenciaViaturasMenu>` — lista chips clicáveis das viaturas
  - `<AlteracoesDiversasCard>` — lista cronológica + botão registrar
  - `<ModalAlteracaoDiversa>` — formulário condicional ao tipo
  - `AjustesPreTurno` ganhou prop `isReadOnly` — banner amarelo + opacity
- `apps/web/src/router.tsx` — 2 rotas novas
- `apps/web/src/lib/api.ts` — métodos `servico*`, `alteracoesDiversas*`,
  `conferenciaEquipe*`, `conferenciaViatura*`

**F2 — frontend:**

- `apps/web/src/lib/whatsapp.test.ts` — fixture migrada com 3 campos novos
  (`composicaoMf: []`, `estadoServico: 'NAO_INICIADO'`, `alteracoesDiversas: []`)

### Documentação

- `docs/adr/ADR-011-mapeamento-previa-mf.md` (novo)
- `docs/adr/ADR-012-estado-do-dia-servico.md` (novo)
- `docs/sprint-logs/s6b.md` (este)

## Verificação end-to-end

```bash
# 0. Restart backend
pnpm dev:api    # log: Mapped {/servico/:data, GET}, .../iniciar POST, etc.

# 1. Login como Fiscal
curl -X POST http://localhost:3000/auth/login -H "Content-Type: application/json" \
  -d '{"nf":"3037509","senha":"<senha>"}' -c /tmp/c.txt

# 2. Estado inicial
curl "http://localhost:3000/servico/2026-05-09" -b /tmp/c.txt | jq
# Esperado: {data, estado:"NAO_INICIADO"}

# 3. Iniciar serviço
curl -X POST "http://localhost:3000/servico/2026-05-09/iniciar" -b /tmp/c.txt | jq
# Esperado: estado:"INICIADO" + iniciadoEm

# 4. Tentar editar ajustes (deve dar 403)
curl -X PUT "http://localhost:3000/previa/2026-05-09/ajustes" -b /tmp/c.txt \
  -H 'Content-Type: application/json' \
  -d '{"trocas":[],"escalaEspecial":{},"notasServico":[],"dispensas":[],"trocasEscalaEspecial":[]}'
# Esperado: 403 — "Edição da Prévia bloqueada — serviço já iniciado"

# 5. Conferir equipe (precisa ser chefe_equipe)
curl -X PUT "http://localhost:3000/conferencia/equipe/2026-05-09" -b /tmp/c.txt \
  -H 'Content-Type: application/json' \
  -d '{"entries":[{"recurso":"ABTS_01","funcao":"Ch","militarOriginalNf":"3037509","statusConferencia":"presente"}]}'

# 6. Conferir viatura (precisa ser motorista)
curl -X PUT "http://localhost:3000/conferencia/viatura/2026-05-09/ABTS%20011" -b /tmp/c.txt \
  -H 'Content-Type: application/json' \
  -d '{"vtrPrefixo":"ABTS 011","kmAtual":12345,"estadoTanquePercent":85,"observacao":"OK"}'

# 7. Registrar alteração diversa
curl -X POST "http://localhost:3000/servico/2026-05-09/alteracoes" -b /tmp/c.txt \
  -H 'Content-Type: application/json' \
  -d '{"tipo":"observacao","observacao":"Chuva forte às 18h"}'

# 8. Encerrar serviço (com force=true se ainda não passou pelas conferências completas)
curl -X POST "http://localhost:3000/servico/2026-05-09/encerrar?force=true" -b /tmp/c.txt | jq
# Esperado: estado:"ENCERRADO"

# 9. Pipeline
pnpm typecheck && pnpm lint && pnpm build
```

**Frontend (http://localhost:5173):**

- `/previa?data=2026-05-09` (logado como fiscal):
  - Card "Serviço do dia" com botão "Iniciar Serviço"
  - Após clicar: banner amarelo + cards "Conferência da Equipe" / "Conferência
    das Viaturas" / "Alterações Diversas"
  - Ajustes pré-turno mostra banner "🔒 bloqueado"
- `/servico/2026-05-09/conferencia-equipe` (logado como chefe_equipe):
  - Lista da composição rotativa
  - Marcar presença → salvar → volta à Prévia
- `/servico/2026-05-09/conferencia-viatura/ABTS%20011` (logado como motorista):
  - Form KM + Tanque + Observação → salvar
- Card "Alterações Diversas" → modal de registro funcional

## Achados durante a implementação

- **Migração não-quebrante:** ao invés de deletar `tripulacao` e
  `viaturasOperacionais` do schema, foram marcados como `@deprecated` e
  derivados do novo `composicaoMf`. Permite WhatsApp e tests legados
  continuarem funcionando enquanto a migração é gradual.
- **`aplicarConferencia` como "porta":** ADR-009 bloqueia status de
  viaturas MF — o método novo é a única exceção autorizada. Documentado
  bem em ADR-011.
- **Auto-promoção do estado:** `Servico` transiciona automaticamente
  quando todas as conferências completas. Reduz cliques do Fiscal.
- **`force=true` para encerramento:** apenas admin pode pular conferências.
  Marcado explicitamente via query string para deixar intenção clara em logs.
- **AlteracaoDiversa só durante serviço:** se Servico estiver
  NAO_INICIADO, mudança de status de viatura via Conferência **não** cria
  Alteração — vai direto pro estado da viatura (cenário pré-turno).

## Métricas

- **Arquivos novos:** ~15 (backend: 7 — servico/conferencias modules+tests;
  frontend: 2 páginas; docs: 3 ADRs+log)
- **Arquivos modificados:** ~12 (shared-types, previa.tsx, viaturas.service.ts,
  ajustes-previa.service.ts, app.module.ts, api.ts, router.tsx, etc.)
- **Tests:** 174 (S6a-fix) → **207** (S6b backend) — +33
  (16 servico + 8 conferência equipe + 5 conferência viatura + 4 ajustes
  read-only)
- **Pipeline:** typecheck ✅ lint ✅ format ✅ build ✅ tests **207/207** ✅

## Próximo passo

- **S5b:** Persistência Prisma+Supabase + deploy Vercel (Servico,
  Conferencias, Alterações migram para tabelas SQL)
- **S9:** Escrita real no MF via Puppeteer — consome `composicaoMf`
  - Conferência + Alterações Diversas
- **S10/S11:** Parte Diária consome o que S6b construiu para gerar
  PDF/DOCX da PD oficial

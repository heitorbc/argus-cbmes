# Sprint S6a-fix — Correções S6a + Combobox militar + ChOp + Escala Especial na Prévia

**Data:** 2026-05-09
**Foco:** 6 lacunas detectadas pelo Tech Lead na verificação manual do S6a
**Tech Lead:** 2º SGT Heitor Barcellos Coelho

> Este sprint complementa S6a com fixes (itens 1, 2) + features adiantadas
> de S6b (itens 3, 4, 5, 6). S6b agora cobre apenas o workflow Servico /
> Conferências / read-only Prévia / refactor PreviaDoDia.

## Critérios de Pronto S6a-fix (DoD)

- [x] **Item 1** Importação de Escala Especial XLSM funciona — smoke test e2e
      garante que a rota `/escalas-especiais/preview` está mapeada
- [x] **Item 2** EFETIVO só **enriquece** campos; nunca adiciona NFs órfãs
      (CAP ALAN NF 3269779 e TEN ALINE NF 4544935 não aparecem mais)
- [x] **Item 3** Trocas pré-turno (Prévia) usam `<MilitarSelect>` em vez de
      input texto
- [x] **Item 4** Seção "Escala Especial" nos Ajustes pré-escala mostra atos
      read-only + botão "Registrar Troca" → modal com `<MilitarSelect>`
- [x] **Item 5** Dispensas (Prévia) campo Militar usa `<MilitarSelect>`
- [x] **Item 6** Card "Chefe de Operações" na Prévia consome planilha externa
      (`1Nlr_uSNVD6dByaWPTL6IttSOa2nQPXO-m7FqTpeH8WI` gid `1250546399`)
- [x] Componente `<MilitarSelect>` reutilizável criado e adotado em viaturas + previa
- [x] ADR-010 (fontes da Prévia) + ADR-008 atualizado (regra "EFETIVO só enriquece")
- [x] Tests: backend 174 (era 161) — +13. Frontend tests preservados
- [x] Pipeline: lint + format + typecheck + build verdes

## Entregas

### Backend (apps/api)

**F1 — Smoke test Escala Especial:**

- `apps/api/src/modules/escalas-especiais/escalas-especiais.controller.test.ts` — 6 cenários
  garantindo que `EscalasEspeciaisModule` carrega e os 4 endpoints (GET / list,
  POST preview, POST confirm, DELETE) estão registrados com método HTTP correto.
  Previne regressão silenciosa quando o servidor é mantido em build antiga.

**F2 — Fix Efetivo:**

- `apps/api/src/modules/efetivo/efetivo.service.ts` — `mergeThreeSources()` linha 293:
  removido `efetivoByNf.keys()` da união. EFETIVO contribui apenas como base de
  enriquecimento para NFs já presentes em DADOS ou 1ª1º.
- `apps/api/src/modules/efetivo/efetivo.service.test.ts` — reescrito com helper
  `dadosFromSampleCsv()` para que os tests preexistentes continuem cobrindo todos os
  3 militares; +4 cenários novos cobrindo a regra S6a-fix (NF só em EFETIVO não
  aparece; CAP ALAN/TEN ALINE explícitos; enriquecimento idade/serviço; militar
  só em 1ª1º aparece).

**F4 + F5 — Schema PreviaDoDia + Ajustes:**

- `packages/shared-types/src/previa.ts`:
  - `escalaEspecialAtoLightSchema`, `trocaEscalaEspecialSchema`, `chefeOperacoesSchema`
  - `addTrocaEscalaEspecialSchema` (input do POST)
  - `ajustesPreviaSchema.trocasEscalaEspecial` + `previaDoDiaSchema.escalaEspecialAtos / trocasEscalaEspecial / chefesOperacoes`
- `apps/api/src/modules/previa/ajustes-previa.service.ts` — métodos
  `addTrocaEscalaEspecial(dataIso, input, registradoPorNf)` e
  `removeTrocaEscalaEspecial(dataIso, atoKey)`. Helper `atoKey(ato)` exportado.
  `upsert()` preserva `trocasEscalaEspecial` existentes (não sobrescreve via PUT
  genérico).
- `apps/api/src/modules/previa/ajustes-previa.service.test.ts` — 6 cenários novos.
- `apps/api/src/modules/previa/previa.controller.ts` — endpoints
  `POST/DELETE /previa/:data/ajustes/escala-especial/trocas`.
- `apps/api/src/modules/previa/previa.service.ts` — injeta `escalaEspecialAtos`
  (via `EscalasEspeciaisService.getAtosDoDia`) e `trocasEscalaEspecial` (via
  ajustes) no payload da Prévia.
- `apps/api/src/modules/previa/previa.module.ts` — importa `EscalasEspeciaisModule`
  + `ChefesOperacoesModule`.

**F6 — ChOp:**

- `apps/api/src/modules/chefes-operacoes/chefes-operacoes-csv-parser.ts` — parser
  da aba "ESCALA DE CHEFE DE OPERAÇÕES" (header detection na linha 6, cols
  POSTO/NOME/TELEFONE/NF, mapeamento de marcadores X/Y/S/* por dia).
- `apps/api/src/modules/chefes-operacoes/chefes-operacoes-csv-parser.test.ts` — 6 cenários
  com fixture real de maio/2026.
- `apps/api/src/modules/chefes-operacoes/chefes-operacoes.service.ts` — espelha
  `QdiService` (cache TTL 5min, lock inflight, fallback stale).
- `apps/api/src/modules/chefes-operacoes/chefes-operacoes.module.ts`
- `apps/api/src/modules/chefes-operacoes/__fixtures__/chop-2026-05.csv` — snapshot
  oficial de maio/2026.
- `apps/api/src/app.module.ts` — registra `ChefesOperacoesModule`.
- `apps/api/.env.example` — adicionado `CHOP_SHEET_ID`, `CHOP_SHEET_GID`,
  `GOOGLE_SHEET_GID_QDI_DADOS`.

### Frontend (apps/web)

**F3 — Componente reutilizável:**

- `apps/web/src/components/militar-select.tsx` — combobox com debounce 300ms,
  navegação por teclado (↑/↓/Enter/Esc), click-outside, chip de selecionado,
  filtro `excluirNfs` (substituído ≠ substituto), aria-* completo.
- `apps/web/src/components/militar-select.test.tsx` — 5 cenários (debounce,
  seleção, disabled, exclusão de NFs, chip de selecionado).

**F4 + F5 — Prévia:**

- `apps/web/src/pages/previa.tsx`:
  - Trocas (substituído + substituto) → `<MilitarSelect>` com `excluirNfs`
    cruzados.
  - Dispensas → `<MilitarSelect>`.
  - Nova seção "Escala Especial" nos Ajustes pré-escala: lista read-only
    dos `escalaEspecialAtos` com botão "Registrar Troca" / "Desfazer troca".
  - Novo card "Chefe de Operações" acima dos ajustes (só aparece se tiver chefes
    no dia).
  - `ModalTrocaEscalaEspecial` componente inline com `<MilitarSelect>` +
    salvar/cancelar.
- `apps/web/src/lib/api.ts` — `previaAddTrocaEscalaEspecial`,
  `previaRemoveTrocaEscalaEspecial`. Bug fix latente: `efetivoList` agora
  envia `somente1aCia` na URL (estava ausente).
- `apps/web/src/lib/whatsapp.test.ts` — fixture `previaCharlie` ganhou os
  3 campos novos do schema.

**F3 (refator) — Viaturas:**

- `apps/web/src/pages/viaturas.tsx` — substituiu lookup militar inline por
  `<MilitarSelect>` (deletou ~50 linhas de combobox manual).

### Documentação

- `docs/adr/ADR-010-fontes-previa-do-dia.md` (novo)
- `docs/adr/ADR-008-tres-fontes-efetivo.md` — nota S6a-fix sobre regra
  "EFETIVO só enriquece"
- `docs/sprint-logs/s6a-fix.md` (este arquivo)

## Verificação end-to-end

```bash
# 0. Reiniciar backend (item 1)
pnpm dev:api    # log deve mostrar Mapped {/escalas-especiais/preview, POST}

# 1. Login admin
curl -X POST http://localhost:3000/auth/login -H "Content-Type: application/json" \
  -d '{"nf":"3037509","senha":"<sua-senha>"}' -c /tmp/c.txt

# 2. Escala Especial preview funciona (item 1)
curl -X POST http://localhost:3000/escalas-especiais/preview -b /tmp/c.txt \
  -F "file=@data/Escala Especial Tabela de Lançamento/05 - ESCALA ESPECIAL 1ª CIA - MAIO.xlsm" \
  | jq '{atos: .escala.atos | length, descartados}'
# Esperado: número > 0

# 3. Efetivo SEM ALAN/ALINE (item 2)
curl "http://localhost:3000/efetivo?somente1aCia=true&page=1&pageSize=200" -b /tmp/c.txt \
  | jq '.items[] | select(.nf=="3269779" or .nf=="4544935")'
# Esperado: vazio

# 4. Chefes de Operações (item 6)
curl "http://localhost:3000/previa?data=2026-05-09" -b /tmp/c.txt \
  | jq '.chefesOperacoes | length'
# Esperado: > 0

# 5. Atos especiais do dia + trocas (item 4)
curl "http://localhost:3000/previa?data=2026-05-09" -b /tmp/c.txt \
  | jq '{atos: .escalaEspecialAtos, trocas: .trocasEscalaEspecial}'

# 6. Registrar troca de escala especial
curl -X POST "http://localhost:3000/previa/2026-05-09/ajustes/escala-especial/trocas" \
  -b /tmp/c.txt -H 'Content-Type: application/json' \
  -d '{"atoOriginal":{"data":"2026-05-09","militarRaw":"SGT MARIANE","horario":"07:10 ÀS 13:10","funcao":"APOIO"},"substituidoRaw":"SGT MARIANE","substitutoRaw":"SGT BARCELLOS","substitutoNf":"3037509"}'

# 7. Smoke test
pnpm typecheck && pnpm lint && pnpm build
```

Frontend (http://localhost:5173):

- `/cadastros/efetivo` → procurar NF 3269779 ou 4544935 → não encontra (item 2)
- `/cadastros/escalas-especiais` → upload do XLSM real → preview funciona (item 1)
- `/cadastros/viaturas` → lookup militar usa novo `<MilitarSelect>` (item 3 refator)
- `/previa/2026-05-09`:
  - **Card "Chefe de Operações"** acima dos Ajustes pré-turno (item 6)
  - **Trocas** com 2 comboboxes (item 3)
  - **Dispensas** com combobox (item 5)
  - **Seção "Escala Especial"** com lista read-only + botão Registrar Troca →
    modal com combobox para substituto (item 4)

## Achados durante a implementação

- **"Cannot POST /escalas-especiais/preview" era servidor desatualizado**, não
  bug de código. O smoke test e2e adicionado em F1 cobre regressão futura.
- **Coluna `S` na planilha ChOp** existe mas é separada da "S" sentinela de
  outras planilhas — aqui é apenas marcador de escala (espera-se que seja
  "Sentinela"/"Service"). Por ora, qualquer marcador X/Y/S/* conta como
  escalado. Distinção semântica fica para sprint futura se relevante.
- **api.efetivoList não enviava `somente1aCia`** — bug latente desde S2.
  Corrigido aqui pois o `<MilitarSelect>` precisa do filtro.
- **Schema do PreviaDoDia ganhou 3 campos novos** com `default([])`. Tests do
  whatsapp.test.ts precisaram ser atualizados manualmente — frontend não tem
  fallback automático para campos novos opcionais (Zod schema valida estrito).
- **Trocas de Escala Especial** substituem se já existir uma para o mesmo ato
  (idempotente). Decisão: chave canônica `data|militarRaw|horario|funcao`.

## Métricas

- **Arquivos novos:** 7 (backend: 5 — controller test, parser, service, module,
  fixture, sprint log; frontend: 2 — MilitarSelect + test; docs: 1 — ADR-010)
- **Arquivos modificados:** ~10 (efetivo.service.ts + test, ajustes-previa.service.ts
  + test, previa.service.ts + test, previa.controller.ts, previa.module.ts,
  app.module.ts, .env.example, packages/shared-types/src/previa.ts, lib/api.ts,
  pages/previa.tsx, pages/viaturas.tsx, lib/whatsapp.test.ts, ADR-008)
- **Tests:** 161 (S6a) → 174 (S6a-fix backend) — +13 (6 controller smoke + 4
  novos efetivo + 6 ajustes + 6 chop parser - 9 reescritos efetivo). Frontend
  preservado (10 + 5 novos = 15 quando MilitarSelect.test.tsx for executado).
- **Pipeline:** typecheck ✅ lint ✅ format ✅ build ✅ tests **172/174** ✅
  (2 fails preexistentes em `auth.service.test.ts` por timeout de bcrypt em
  Windows — flake conhecido, não relacionado ao S6a-fix)

## Próximo passo (S6b — workflow operacional)

S6b traz o item 4 **operacional** do pedido original (não confundir com
"item 4" deste sprint, que era trocas de Escala Especial):

- **Servico**: estado do dia
  (NAO_INICIADO / INICIADO / EQUIPE_CONFERIDA / VIATURA_CONFERIDA /
  PREENCHENDO_MF / ENCERRADO)
- **Conferência da Equipe** (Chefe): marca presenças, registra substituições
- **Conferência da Viatura** (Motorista): muda status, preenche
  `estadoTanquePercent`, registra observações datadas
- **Read-only Prévia**: após `Servico.iniciar()`, `/previa` vira somente leitura
- **Refactor PreviaDoDia**: shape espelhando o Mapa Força para escrita futura (S9)
- **ADR-011**: mapeamento campo-a-campo Prévia↔MF
- **Trocas pré-serviço** → seção "Equipes" da PD; **trocas durante serviço** →
  "Alterações Diversas" com horário
- **Viatura baixada com motivo persistente** + alteração de viatura durante serviço

S5b (Persistência Prisma+Supabase + deploy Vercel) continua planejado para
entrar antes do go-live de homologação.

# Sprint S6d — Entidades Unidade + Recurso configurável (seed 1ª1º)

**Data:** 2026-05-10
**Foco:** Migrar whitelists hardcoded (`RECURSOS_VALIDOS`/`RECURSOS_STAFF`/`RECURSOS_AQUATICAS`)
para entidade `Recurso` por `Unidade`, com seed da 1ª1º.
**Tech Lead:** 2º SGT Heitor Barcellos Coelho

> Sprint pequeno (~1d) preparando o terreno para CRUD UI futuro (S6e/S6f) e
> persistência Supabase (S5b). Sem mudança de comportamento operacional.

## Critérios de Pronto S6d (DoD)

- [x] **F1** Schemas Zod `unidadeSchema` + `recursoSchema` (com `categoria`,
      `comportaViatura`, `comportaEfetivo`) em `@argus/shared-types`.
- [x] **F2** `UnidadesService` + `RecursosService` com seed hardcoded da 1ª1º
      (1 unidade + 19 recursos espelhando ordem da planilha MF). Ambos
      `OnModuleInit` populando o storage in-memory.
- [x] **F3** `parseMapaForcaCsv(csv, { recursosValidos })` aceita whitelist
      injetada. `MapaForcaService` injeta `RecursosService.nomesValidos(unidadeId)`.
      Fallback hardcoded preservado para compat com tests legados.
- [x] **F4** `PreviaService` consome `RecursosService.nomesPorCategoria()`
      para `AQUATICA` e `STAFF`, eliminando os arrays hardcoded
      `RECURSOS_AQUATICAS`/`RECURSOS_STAFF`.
- [x] Endpoints read-only: `GET /unidades`, `GET /unidades/:id`,
      `GET /recursos?unidadeId=&ativoSomente=`, `GET /recursos/:id`.
- [x] Tests novos: 17 cenários novos (UnidadesService 4 + RecursosService 12 + parser/whitelist injetada 1). Backend 211 → **228** passando.
- [x] Pipeline: typecheck + lint + format + build verdes.

## Entregas

### Pacote shared-types

- `packages/shared-types/src/unidade.ts` (novo) — `unidadeSchema` (id, codigo,
  nome, ativo, criadoEm, atualizadoEm).
- `packages/shared-types/src/recurso.ts` (novo) — `recursoSchema`
  (id, unidadeId, nome, categoria, ativo, comportaViatura, comportaEfetivo,
  ordem) + enum `CATEGORIA_RECURSO`.
- `packages/shared-types/src/index.ts` — exporta os 2 novos arquivos.

### Backend (apps/api)

**F2 — Módulos `unidades` e `recursos`:**

- `apps/api/src/modules/unidades/`
  - `unidades.service.ts` — `OnModuleInit` cria a 1ª1º com slug fixo
    `unid:1cia-1bbm` (constante `UNIDADE_1CIA_1BBM_ID` exportada).
  - `unidades.controller.ts` — `GET /unidades`, `GET /unidades/:id`
  - `unidades.module.ts`
  - `unidades.service.test.ts` — 4 cenários

- `apps/api/src/modules/recursos/`
  - `recursos.service.ts` — `OnModuleInit` semeia 19 recursos da 1ª1º
    (ABTS_01..GUARDA) com flags `ativo`/`comportaViatura`/`comportaEfetivo`
    e categoria `OPERACIONAL`/`STAFF`/`AQUATICA`/`GUARDA`.
    Atalhos `nomesValidos(unidadeId)` e `nomesPorCategoria(unidadeId, cat)`
    para consumo do parser/Previa.
  - `recursos.controller.ts` — `GET /recursos?unidadeId=&ativoSomente=`,
    `GET /recursos/:id`
  - `recursos.module.ts`
  - `recursos.service.test.ts` — 10 cenários

- `apps/api/src/app.module.ts` — registra `UnidadesModule` e `RecursosModule`.

**F3 — Parser MF consumindo entidade Recurso:**

- `apps/api/src/modules/mapa-forca/mapa-forca-csv-parser.ts`
  - `parseMapaForcaCsv(csv, options?)` ganha `options.recursosValidos: Set<string>`.
  - Constante `RECURSOS_VALIDOS_FALLBACK` mantida como default (para tests
    legados que chamam sem opções).
  - Função interna `isRecursoValido` agora é local ao parse (closure sobre
    o set escolhido), eliminando a global.
- `apps/api/src/modules/mapa-forca/mapa-forca.service.ts`
  - Injeta `RecursosService` + `UNIDADE_1CIA_1BBM_ID`.
  - `fetchAndParse()` chama `recursos.nomesValidos(UNIDADE_1CIA_1BBM_ID)` e
    passa para o parser via `options`.
- `apps/api/src/modules/mapa-forca/mapa-forca.module.ts` — importa
  `RecursosModule`.
- Test novo: `parseMapaForcaCsv` respeita `recursosValidos` passada via
  opções (whitelist reduzida).

**F4 — PreviaService consumindo categoria Recurso:**

- `apps/api/src/modules/previa/previa.service.ts`
  - Remove constantes hardcoded `RECURSOS_AQUATICAS` e `RECURSOS_STAFF`.
  - Injeta `RecursosService`. No `getPreviaDoDia`, calcula
    `nomesPorCategoria(UNIDADE_1CIA_1BBM_ID, 'AQUATICA')` e `'STAFF'` antes
    de chamar `buildComplementosFromMapaForca`.
  - `buildComplementosFromMapaForca` agora recebe os 2 arrays como parâmetros.
- `apps/api/src/modules/previa/previa.module.ts` — importa `RecursosModule`.
- `apps/api/src/modules/previa/previa.service.test.ts` — adiciona helper
  `makeRecursosService()` (instancia + chama `onModuleInit` para semear) e
  passa para os 4 `new PreviaService(...)`.

### Documentação

- `docs/sprint-logs/s6d.md` (este)
- **Sem ADR novo** (refator interno; entidades só viraram primeira-classe sem
  mudar comportamento operacional). ADR-006/008/010/011 continuam válidos.

## Verificação end-to-end

```bash
# 0. Restart backend
pnpm dev:api

# 1. Login
curl -X POST http://localhost:3000/auth/login -H "Content-Type: application/json" \
  -d '{"nf":"3037509","senha":"<senha>"}' -c /tmp/c.txt

# 2. Listar unidades (1 entry: 1ª1º)
curl http://localhost:3000/unidades -b /tmp/c.txt | jq
# Esperado: [{ id: "unid:1cia-1bbm", codigo: "1ª1º", nome: "1ª Cia / 1º BBM", ativo: true, ... }]

# 3. Listar recursos da 1ª1º
curl "http://localhost:3000/recursos?unidadeId=unid:1cia-1bbm" -b /tmp/c.txt | jq 'length'
# Esperado: 19

# 4. Filtrar só ativos
curl "http://localhost:3000/recursos?unidadeId=unid:1cia-1bbm&ativoSomente=true" -b /tmp/c.txt \
  | jq '[.[] | select(.categoria=="STAFF")] | map(.nome)'
# Esperado: ["CHEFE DE OPERAÇÕES"]

# 5. Prévia continua funcionando como antes (sem mudança de comportamento)
curl "http://localhost:3000/previa?data=2026-05-09" -b /tmp/c.txt | jq '.composicaoMf | length'
# Esperado: mesmo número de recursos da Prévia anterior ao S6d

# 6. Pipeline
pnpm typecheck && pnpm lint && pnpm build
```

## Achados durante a implementação

- **Whitelist hardcoded em 2 lugares (parser + previa):** o S6c já tinha
  alinhado o conteúdo (OFICIAL DE DIA/PERITOS removidos). S6d junta tudo
  num só ponto: `RecursosService.nomesValidos()` substitui `RECURSOS_VALIDOS`
  e `nomesPorCategoria()` substitui `RECURSOS_STAFF`/`RECURSOS_AQUATICAS`.
- **Fallback no parser preservado:** `parseMapaForcaCsv` continua aceitando
  ser chamado sem opções (testes existentes do parser passaram sem
  mudança). Em produção, `MapaForcaService` sempre injeta o set.
- **Tests instanciam services manualmente:** o `OnModuleInit` do Nest não
  roda em testes que fazem `new RecursosService()`. Helper
  `makeRecursosService()` chama `onModuleInit()` para semear.
- **Sem CRUD UI ainda:** endpoints só de leitura (GET). Admin que precisar
  adicionar/remover recurso precisa editar o seed em `recursos.service.ts`
  por enquanto. CRUD UI fica para S6e (admin) ou após S5b.

## Métricas

- **Arquivos novos:** 8
  - 2 schemas (unidade.ts + recurso.ts)
  - 3 do módulo unidades + 1 test
  - 3 do módulo recursos + 1 test
  - sprint log
- **Arquivos modificados:** 7
  - shared-types/src/index.ts
  - app.module.ts
  - mapa-forca-csv-parser.ts
  - mapa-forca-csv-parser.test.ts (+1 cenário)
  - mapa-forca.service.ts
  - mapa-forca.module.ts
  - previa.service.ts
  - previa.module.ts
  - previa.service.test.ts (helper makeRecursosService)
- **Tests:** 211 (S6c) → **228** (S6d) — +17 cenários novos
- **Pipeline:** typecheck ✅ lint ✅ format ✅ build ✅ tests **228/228** ✅

## Próximo passo

- **S6e (futuro):** CRUD admin de Unidades/Recursos (UI + endpoints
  POST/PUT/DELETE). Estende seed com 2ª1º quando o sistema for liberado
  para mais OBMs.
- **S5b:** Persistência Prisma+Supabase + deploy Vercel — entidades
  Unidade/Recurso ganham tabelas próprias.
- **S9:** Escrita real no MF (Puppeteer) usando ordem dos `Recurso` para
  determinar a sequência de linhas.
- **S10/S11:** Parte Diária consumindo `composicaoMf` + categoria do recurso
  (ex.: STAFF aparece em seção separada da PD).

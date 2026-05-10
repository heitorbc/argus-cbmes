# Sprint S6g (fix) — Prévia não usa militares do Mapa Força

**Data:** 2026-05-10
**Foco:** Correção pontual reportada pelo Tech Lead — remover do `PreviaService`
o complemento de militares vindos do MF (AQUATICAS/STAFF). Tripulação passa a
vir 100% da Escala XLSX da SOS.
**Tech Lead:** 2º SGT Heitor Barcellos Coelho

> Sprint pequeno (~1h) corrigindo comportamento herdado do S4/F3b. Não há
> mudança visual no frontend além do desaparecimento dos blocos AU_154,
> AC_001 e AM_002 quando não há escala importada.

## Critérios de Pronto S6g (DoD)

- [x] **F1** `PreviaService.getPreviaDoDia` deixa de chamar
      `buildComplementosFromMapaForca`. Tripulação só recebe entries do XLSX
      (`escalados.entries`).
- [x] **F2** Funções `buildComplementosFromMapaForca`, `makeEntry` e
      `parseMilitarRawSimple` removidas (eram usadas só pelo complemento).
- [x] **F3** `MapaForcaService` e `RecursosService` removidos do construtor
      do `PreviaService` (não mais usados — status de viatura vem indireto via
      `ViaturasService`).
- [x] **F4** `PreviaModule` deixa de importar `MapaForcaModule` e
      `RecursosModule` (limpeza de dependências).
- [x] **F5** Teste obsoleto "complementa tripulação com MERGULHO 02 do Mapa
      Força" removido. Substituído por **+1 teste positivo** que valida o
      novo comportamento e **+1 teste de regressão** no describe de
      inconsistências (cenário do screenshot 10/05).
- [x] Pipeline: typecheck + lint + format + build verdes;
      backend **241/241 passing** (228 antes do S6e, 240 com CRUD admin, 241
      com este fix — saldo: -1 teste removido + 2 novos).

## Causa raiz

`PreviaService.getPreviaDoDia` (versão pré-S6g, linhas 97-110) chamava:

```typescript
const recursosMf = await this.mapaForca.getRecursos();
const recursosAquaticas = this.recursos.nomesPorCategoria(UNIDADE_1CIA_1BBM_ID, 'AQUATICA');
const recursosStaff = this.recursos.nomesPorCategoria(UNIDADE_1CIA_1BBM_ID, 'STAFF');
const complementos = buildComplementosFromMapaForca(
  recursosMf,
  tripulacao,
  recursosAquaticas,
  recursosStaff,
);
for (const entry of complementos) {
  tripulacao.push(this.buildTripulacaoEntry(entry, matcher, inconsistencias));
}
```

Para todo recurso do MF com categoria `AQUATICA` (MERGULHO/SALVAMAR/QUADRICICLO)
ou `STAFF` (CHEFE DE OPERAÇÕES), os militares vindos das colunas D-J do MF eram
adicionados à tripulação **independentemente de haver escala importada**.

No screenshot do dia 10/05/2026 (sem XLSX de maio importado), apareciam:

- **AU_154** — CHEFE DE OPERAÇÕES (categoria STAFF) com 1ºTEN QOA PISKE + 3ºSGT HOMERO
- **AC_001** — QUADRICICLO 01 (categoria AQUATICA) com 3ºSGT DAN
- **AM_002** — MERGULHO 02 (categoria AQUATICA) com 3ºSGT RAFAEL + CB ALVARENGA + SD PELICIONI

Esse comportamento contradiz a regra que o Tech Lead reafirmou:

> A Prévia usa do MF apenas info de **Recurso** (whitelist, categorias) e
> **Viatura** (status). Militares vêm 100% da Escala XLSX da SOS.

## Entregas

### Backend

**`apps/api/src/modules/previa/previa.service.ts`:**

- Removido bloco de complemento (10 linhas).
- Removidas funções privadas `buildComplementosFromMapaForca` (linhas 290-325),
  `makeEntry` (327-340) e `parseMilitarRawSimple` (346-361). Total: ~80 linhas.
- Removidos imports não usados: `MapaForcaService`, `RecursosService`,
  `UNIDADE_1CIA_1BBM_ID`, `RecursoMapaForca`.
- Removido `mapaForca` e `recursos` do construtor.
- Comentário de cabeçalho atualizado: documenta a fronteira "MF dá viatura,
  XLSX dá militares; ChefesOperações é planilha externa".

**`apps/api/src/modules/previa/previa.module.ts`:**

- Removido import de `MapaForcaModule` e `RecursosModule` (não mais
  necessários — `ViaturasModule` continua importando `MapaForcaModule`
  para `viaturas.list()`).

**Tests — `apps/api/src/modules/previa/previa.service.test.ts`:**

- Removido `FakeMapaForcaService` + `makeRecursosService` + imports
  associados (`RecursosService`, `UnidadesService`, `RecursoMapaForca`).
- Atualizados 3 `new PreviaService(...)` para nova assinatura (sem
  `mapaForca` e `recursos`).
- **Removido** teste "complementa tripulação com MERGULHO 02 do Mapa Força"
  (esse era exatamente o comportamento sendo retirado).
- **Adicionado** teste positivo "S6g — não complementa tripulação com
  militares do MF" no describe principal.
- **Adicionado** teste de regressão "S6g — sem XLSX, Tripulação fica vazia
  mesmo se houvesse recursos AQUATICAS/STAFF no MF" no describe de
  inconsistências.

### Frontend

**Sem mudanças** — `previa.tsx` e `whatsapp.ts` já lidavam corretamente com
`tripulacao` vazia.

### Documentação

- `docs/sprint-logs/s6g.md` (este).
- Sem ADR novo (correção/reversão de comportamento herdado; ADR-005 e ADR-011
  continuam descrevendo a fronteira correta — esse fix é o alinhamento prático).

## Verificação end-to-end

```bash
# 1. Pipeline
pnpm typecheck && pnpm lint && pnpm format:check && pnpm build
pnpm --filter api test
# Esperado: 241/241 passing

# 2. Restart backend
pnpm dev:api

# 3. Login + GET Prévia 10/05/2026 (cenário do screenshot — SEM XLSX importado)
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"nf":"3037509","senha":"<senha>"}' -c /tmp/c.txt

curl "http://localhost:3000/previa?data=2026-05-10" -b /tmp/c.txt \
  | jq '.tripulacao | length'
# Esperado: 0 (era >0 antes do fix)

curl "http://localhost:3000/previa?data=2026-05-10" -b /tmp/c.txt \
  | jq '.tripulacao | map({equipe, viatura, raw: .militarRef.raw})'
# Esperado: [] (sem AU_154/AC_001/AM_002)

curl "http://localhost:3000/previa?data=2026-05-10" -b /tmp/c.txt \
  | jq '.composicaoMf | map(.recurso) | sort'
# Esperado: lista de viaturas do MF preservada (AU_154, AM_002, ABTS_011, etc.)
# como viaturas órfãs (vtrStatus, sem chefe/motorista/operadores)
```

**Frontend (http://localhost:5173/previa?data=2026-05-10):**

- **Antes do fix:** seção "Tripulação" mostra AU_154 / AC_001 / AM_002 com
  militares, mesmo sem escala importada.
- **Depois do fix:** seção "Tripulação" vazia (zero entries).
  Inconsistências `SEM_ESCALA_NO_MES` + `EQUIPE_NAO_ESCALADA_NO_DIA`
  permanecem visíveis.
- Para uma data **com** escala importada (ex.: `2026-04-23`), a Tripulação
  mostra os militares do XLSX normalmente. Recursos AQUATICAS/STAFF que
  estavam SÓ no MF (não no XLSX) **não aparecem mais** — comportamento
  desejado.

## Achados durante a implementação

- **Comportamento herdado do S4/F3b:** o complemento via MF foi introduzido
  para "preencher Mergulho/ChOp" antes de termos o XLSX completo. Com a Escala
  Especial XLSM (S6a) e Chefes de Operações de planilha externa (S6a-fix
  item 6) já cobrindo essas funções, o complemento ficou redundante e
  causa o bug visual reportado.
- **`composicaoMf` continua útil:** mesmo com tripulação vazia,
  `buildComposicaoMf` adiciona viaturas órfãs do MF (linha 422-435) com
  `vtrStatus`. Isso preserva a grade de viaturas e a tela de Conferência.
- **Texto WhatsApp:** sem complemento, o texto não terá grupos `STAFF` e
  `AQUATICAS`. Correto: a Prévia espelha apenas o que está oficialmente
  importado.
- **Limpeza de DI cascata:** removidas 2 dependências do construtor
  (MapaForcaService + RecursosService) e 2 imports do PreviaModule. PreviaService
  agora depende só do que efetivamente usa.

## Métricas

- **Arquivos modificados:** 3
  - `apps/api/src/modules/previa/previa.service.ts` (-80 linhas, helpers removidos)
  - `apps/api/src/modules/previa/previa.module.ts` (-2 imports)
  - `apps/api/src/modules/previa/previa.service.test.ts` (refator de DI + teste obsoleto removido + 2 testes novos)
- **Arquivos novos:** 1 (`docs/sprint-logs/s6g.md`)
- **Tests:** 240 (S6e) → **241** (S6g) — saldo: -1 obsoleto + 2 novos
- **Pipeline:** typecheck ✅ lint ✅ format ✅ build ✅ tests **241/241** ✅

## Próximo passo

- **S5b:** Persistência Prisma+Supabase + deploy Vercel.
- **S9:** Escrita real no MF (Puppeteer) — fronteira agora claríssima
  entre leitura (status de viatura) e escrita (composicaoMf da Prévia
  consolidada).
- **S10/S11:** Parte Diária consumindo `composicaoMf` + `chefesOperacoes` +
  `escalaEspecial`.

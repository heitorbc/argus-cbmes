# ADR-010 — Fontes da Prévia do Mapa Força (sem efetivo bruto, com ChOp)

**Status:** Aceito
**Data:** 2026-05-09
**Sprint:** S6a-fix
**Decisor:** 2º SGT Heitor Barcellos Coelho — Tech Lead

## Contexto

Após o S5/S6a a Prévia do dia consumia 5 fontes (Escalas, Mapa Força, Efetivo,
Fiscais, IDEO + Viaturas) e expunha campos do efetivo apenas como base para
resolução nome→NF da tripulação (via `NomeMatcher`). Em uso real, o Tech Lead
identificou três pendências:

1. **Falta lista de Chefes de Operações (ChOp)** escalados no dia. Esses
   militares vêm de uma planilha **separada** (`1Nlr_uSNVD6dByaWPTL6IttSOa2nQPXO-m7FqTpeH8WI`,
   gid `1250546399`) e não estão no XLSX da SOS nem no Mapa Força. A Prévia
   precisa exibi-los com `Posto + Nome de Guerra + NF + Telefone`.
2. **Atos da Escala Especial** importados via XLSM precisam aparecer **read-only**
   na Prévia, com a possibilidade de o Fiscal registrar uma **troca por ato**
   (substituto pontual) — para virar futuramente uma seção dedicada na Parte
   Diária (S10/S11).
3. **A Prévia não deve listar efetivo bruto da planilha** (lista demográfica
   completa de militares). Esse comportamento já existia (a tripulação vinha
   apenas de escalados resolvidos), mas precisava ser reafirmado: nenhuma
   nova fonte da Prévia pode introduzir militares pelo simples fato de
   estarem cadastrados.

## Decisão

### 1. ChOp como nova fonte primária da Prévia

Novo módulo `apps/api/src/modules/chefes-operacoes/`:

- `ChefesOperacoesService` — espelha o padrão `QdiService` (cache TTL 5min,
  lock inflight, fallback stale).
- `chefes-operacoes-csv-parser.ts` — lê o CSV público da aba "ESCALA DE
  CHEFE DE OPERAÇÕES":
  - Detecta o header `#,Nº,ANT,POSTO,NOME DE GUERRA,TELEFONE,NF,1..31,EDOCs,FÉRIAS,U,F,S,TOTAL`
  - Extrai linhas com `Nº` numérico (ignora separadores e linhas de total)
  - Para um dia D, retorna apenas militares com marcador `X`/`Y`/`S`/`*` na
    coluna do dia (filtra valores como "CURSO" / "FÉRIAS" que indicam
    ausência).
- Configurável via env: `CHOP_SHEET_ID` + `CHOP_SHEET_GID` (defaults para
  o anchor confirmado pelo Tech Lead).

**Schema** em `previa.ts`:

```typescript
export const chefeOperacoesSchema = z.object({
  posto: z.string(),
  nomeGuerra: z.string(),
  nf: z.string(),
  telefone: z.string().optional(),
  marcador: z.string().optional(), // X / Y / S / *
});
chefesOperacoes: z.array(chefeOperacoesSchema).default([]),
```

`PreviaService.getPreviaDoDia(dataIso)` injeta `chefesOperacoes` via
`ChefesOperacoesService.getEscaladosDoDia(ano, mes, dia)`. Falha de fetch
não derruba a Prévia — degrada para lista vazia (espelhando padrão dos
outros services).

UI (apps/web/src/pages/previa.tsx) renderiza um card "Chefe de Operações"
acima dos Ajustes pré-turno: `Posto + NomeGuerra` à esquerda, `NF + Telefone`
à direita, com badge do marcador quando relevante.

### 2. Atos da Escala Especial injetados read-only + trocas por ato

`PreviaDoDia` ganha:

```typescript
escalaEspecialAtos: z.array(escalaEspecialAtoLightSchema).default([]),
trocasEscalaEspecial: z.array(trocaEscalaEspecialSchema).default([]),
```

`PreviaService` chama `EscalasEspeciaisService.getAtosDoDia(ano, mes, dataIso)`
(já existia desde S6a) e injeta a lista. As trocas vêm de `AjustesPreviaService`
(persistidas por dia, mock in-memory).

**Granularidade da troca:** por ato específico — chave canônica
`data|militarRaw|horario|funcao`. Decisão registrada via AskUserQuestion:
um militar pode ter vários atos no mês e só algum específico precisa ser
trocado.

```typescript
export const trocaEscalaEspecialSchema = z.object({
  atoOriginal: escalaEspecialAtoLightSchema,
  substituidoNf: z.string().optional(),
  substituidoRaw: z.string(),
  substitutoNf: z.string().optional(),
  substitutoRaw: z.string(),
  registradoEm: z.string(),
  registradoPorNf: z.string(),
});
```

**Endpoints:**

- `POST /previa/:data/ajustes/escala-especial/trocas` — body com `atoOriginal`
  + substituido/substituto. Se já houver troca para o mesmo ato, substitui
  (idempotente). RBAC: admin / fiscal / sargenteante.
- `DELETE /previa/:data/ajustes/escala-especial/trocas/:atoKey` — remove
  por chave url-encoded.

UI: nova seção "Escala Especial" nos Ajustes pré-escala com lista read-only
dos atos do dia. Cada ato exibe `Registrar Troca` (abre modal com
`<MilitarSelect>`) ou `Desfazer troca` quando já existe troca.

A Parte Diária (S10/S11) lerá `trocasEscalaEspecial` da PreviaDoDia para
preencher uma seção específica de "Trocas de Escala Especial".

### 3. Componente `<MilitarSelect>` reutilizável

Novo `apps/web/src/components/militar-select.tsx`:

- Combobox com debounce 300ms via `api.efetivoList({q, somente1aCia, page, pageSize})`.
- Acessibilidade: aria-combobox, aria-activedescendant, navegação por
  teclado (↑/↓/Enter/Esc), toques ≥44×44px.
- Reusado em viaturas.tsx (responsável pela viatura), previa.tsx (trocas,
  dispensas, modal de troca de Escala Especial).

### 4. Reafirmação: efetivo bruto não vai para a Prévia

Combinado com [ADR-008] (EFETIVO só enriquece, não adiciona NFs):

- `PreviaService.efetivo.getAll({ somente1aCia: true })` retorna apenas
  militares de DADOS+1ª1º (após o fix do S6a-fix item 2).
- A Prévia exibe apenas militares **escalados** (via composição XLSX +
  complementos do MF) e os ChOp **escalados no dia** — nunca a lista
  demográfica completa.

## Alternativas consideradas

- **Atrelar ChOp ao Mapa Força:** rejeitado — ChOp tem planilha própria com
  granularidade diária (escala mensal por militar) que não bate com o
  recurso "CHEFE DE OPERAÇÕES" no MF (que é instantâneo). As duas fontes
  podem coexistir no futuro: MF mostra quem está agora; ChOp planeja o mês.
- **Trocas de Escala Especial em service separado:** rejeitado — ato é
  estado da Prévia do dia; coeso com trocas comuns / dispensas.
- **Trocas por dia ou por militar:** rejeitado — granularidade por ato é
  necessária pois um militar pode ter vários atos no mês.

## Consequências

**Positivas:**

- Fiscal vê uma única tela com tudo que precisa para o dia: tripulação,
  Escala Especial (com trocas), ChOp, IDEO, viaturas, dispensas, NS.
- Componente `<MilitarSelect>` elimina duplicação entre viaturas + previa
  e centraliza UX (debounce, teclado, mobile).
- Trocas persistidas em `PreviaDoDia` ficam disponíveis para a Parte Diária
  (S10/S11) sem refactor adicional — só adicionar a seção na PD.

**Negativas:**

- 1 nova chamada HTTP a Google Sheets em cada `getPreviaDoDia` (até bater
  o cache TTL 5min). Custo amortizado.
- Falha do ChOp degrada silenciosamente (lista vazia). Inconsistência não
  é registrada hoje — adicionar `CHOP_INDISPONIVEL` em `TIPO_INCONSISTENCIA`
  pode ser útil em S6b.
- Schema `PreviaDoDia` cresceu (3 campos novos) — clientes legados
  precisam aceitar arrays opcionais com `default([])`.

## Tests

- `apps/api/src/modules/chefes-operacoes/chefes-operacoes-csv-parser.test.ts` — 6
  cenários (header detection, marcadores X/Y/S/*, filtragem de "CURSO"/"FÉRIAS",
  separadores ignorados, header ausente).
- `apps/api/src/modules/previa/ajustes-previa.service.test.ts` — 6 cenários
  cobrindo add/remove/idempotência das trocas de Escala Especial.
- `apps/api/src/modules/previa/previa.service.test.ts` — 14 cenários
  (atualizados para passar `ChefesOperacoesService` e `EscalasEspeciaisService`
  na construção).

## Próximas iterações

- **S6b:** Servico/Conferências/read-only Prévia/refactor PreviaDoDia
  espelhando MF/escrita MF/ADR-011 mapeamento campo-a-campo Prévia↔MF.
- **S10/S11:** Parte Diária consome `trocasEscalaEspecial` na seção
  dedicada; consome `chefesOperacoes` no cabeçalho operacional.
- **S5b:** Persistência Prisma+Supabase para `AjustesPrevia` e
  `EscalasEspeciaisMensal`.

## Referências

- [ADR-008 — Três fontes de Efetivo (DADOS > 1ª1º > EFETIVO)](./ADR-008-tres-fontes-efetivo.md)
- [ADR-009 — Viaturas: nomenclatura igual ao MF + flag origem + bloqueio](./ADR-009-viaturas-nomenclatura-mf-e-origem.md)

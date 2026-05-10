# ADR-011 — Refactor PreviaDoDia → composicaoMf espelhando o Mapa Força

**Status:** Aceito
**Data:** 2026-05-09
**Sprint:** S6b
**Decisor:** 2º SGT Heitor Barcellos Coelho — Tech Lead

## Contexto

Após S6a-fix a Prévia consolida 5 fontes (escalas + ChOp + escala especial +
ajustes pré-turno + IDEO) num shape próprio:

- `tripulacao: PreviaTripulacaoEntry[]` — 1 linha por militar (equipe, viatura,
  funcao, militarRef, militarResolvido).
- `viaturasOperacionais: …[]` — 1 linha por viatura (id, codigo, descricao,
  vtrStatus).

Esse shape difere materialmente do Mapa Força (MF), onde **cada linha é 1
recurso** (ex.: ABTS_01) com `chefe + motorista + operadores[]` e
`vtrStatus`. Para preparar a escrita do MF (S9 — Puppeteer) e introduzir
Conferência da Equipe (S6b/F3), precisamos:

1. Espelhar o shape do MF na estrutura interna.
2. Adicionar `statusConferencia` por militar (necessário pra Conferência).
3. Eliminar a duplicação `tripulacao` × `viaturasOperacionais` (status estava
   em dois lugares).

## Decisão

### 1. Novo shape: `composicaoMf`

`PreviaDoDia.composicaoMf: ComposicaoMfEntry[]` — 1 entry por recurso do MF:

```typescript
export const composicaoMfMilitarSchema = z.object({
  raw: z.string(),
  postoAbreviado: z.string(),
  nomeGuerra: z.string(),
  militarResolvido: militarSchema.nullable(),
  statusConferencia: z.enum(STATUS_CONFERENCIA).default('pendente'),
  substitutoNf: z.string().optional(),
  substitutoRaw: z.string().optional(),
  isFiscal: z.boolean().default(false),
});

export const composicaoMfEntrySchema = z.object({
  recurso: z.string(),                       // chave canônica do MF (ex.: ABTS_01)
  vtrPrefixo: z.string().optional(),
  vtrStatus: z.enum(STATUS_VIATURA).nullable(),
  semEquipe: z.boolean().default(false),
  equipe: z.enum(LETRA_EQUIPE).nullable(),
  chefe: composicaoMfMilitarSchema.optional(),
  motorista: composicaoMfMilitarSchema.optional(),
  operadores: z.array(composicaoMfMilitarSchema).default([]),
});
```

### 2. Migração não-quebrante

`tripulacao` e `viaturasOperacionais` continuam no schema **deprecated** —
derivados pelo `PreviaService` a partir de `composicaoMf`. Isso permite:

- WhatsApp (S5/F7d) continua funcionando sem alteração imediata
- Tests legados continuam passando
- Migração gradual em sprint futura para remover totalmente

JSDoc nos campos avisa: "use `composicaoMf` em código novo".

### 3. Geração no PreviaService

Função `buildComposicaoMf(tripulacao, viaturas)`:

1. Agrupa entries de `tripulacao` por viatura/recurso
2. Para cada grupo: identifica chefe (`funcao === 'Ch'`), motorista
   (`funcao === 'Mot'`), operadores (resto)
3. Cruza com `viaturasOperacionais` para popular `vtrStatus` e `vtrPrefixo`
4. Adiciona viaturas órfãs (sem tripulação) com `semEquipe: true`

`statusConferencia` é injetado pelo `ConferenciaEquipeService` em chamadas
futuras (S6b/F3 leitura cruzada).

### 4. Mapeamento campo-a-campo MF ↔ Prévia

| Campo MF              | Campo composicaoMf                       | Notas                       |
| --------------------- | ---------------------------------------- | --------------------------- |
| Col A: recurso        | `recurso`                                | Chave canônica              |
| Col B: vtrPrefixo     | `vtrPrefixo`                             | Espelhado                   |
| Col C: vtrStatus      | `vtrStatus`                              | DISPONIVEL/BAIXADA/EMPRESTADA |
| Col D: semEquipe      | `semEquipe`                              | Boolean                     |
| Col E: chefe (raw)    | `chefe.raw`                              | Texto cru do MF             |
| Col F: motorista      | `motorista.raw`                          | Texto cru                   |
| Cols G-J: operadores  | `operadores[].raw`                       | Array                       |
| —                     | `*.militarResolvido`                     | Adicionado via NomeMatcher  |
| —                     | `*.statusConferencia`                    | Adicionado pela Conferência |
| —                     | `*.isFiscal`                             | Marcado pelo PreviaService  |

### 5. Conferência marca presença

A `ConferenciaEquipeService.bulkUpdate(dataIso, entries[])` aceita uma lista
de marcações `{recurso, funcao, militarOriginalNf, statusConferencia, ...}`.
Quando todos os militares != 'pendente', promove `Servico → EQUIPE_CONFERIDA`.

### 6. Alterações Diversas (trocas durante serviço)

`AlteracaoDiversa` é **separada** de `composicaoMf` (não modifica diretamente).
Quando o Servico está iniciado e há uma troca, ela vai para
`PreviaDoDia.alteracoesDiversas[]`. Aplicação no MF (S9) usa:

```
shape final do MF = composicaoMf
                  + Conferência (substituições registradas)
                  + Alterações Diversas (trocas durante serviço)
```

## Alternativas consideradas

- **Manter `tripulacao` e adicionar campo `statusConferencia` direto:**
  rejeitado — não prepara a escrita do MF e duplica `viaturasOperacionais`.
- **Refatorar para shape novo + remover legado:** rejeitado por agora —
  quebra WhatsApp + tests preexistentes. Migração gradual é mais segura.
- **Modelar Conferência como modificação direta da Prévia:** rejeitado —
  precisaria de versionamento; um service dedicado é mais limpo.

## Consequências

**Positivas:**

- Escrita do MF (S9) consome `composicaoMf` direto — 1:1 com cells da
  planilha.
- Conferência da Equipe tem unidade clara (1 ato = 1 entry no
  ConferenciaEquipeService) sem mexer na Prévia.
- Tracing claro de "alterações durante o serviço" vs "ajustes pré-turno"
  via `alteracoesDiversas[]`.
- Frontend pode renderizar `composicaoMf` agrupado por recurso (já que MF
  pensa por recurso, não por militar).

**Negativas:**

- Schema `PreviaDoDia` cresceu (3 campos novos). Compensado pela depreciação
  dos 2 antigos.
- WhatsApp ainda usa `tripulacao` derivado — eventual refator quando
  consolidarmos a remoção.
- `composicaoMf` é regenerado a cada `getPreviaDoDia` — performance OK pois
  é in-memory.

## Tests

- `apps/api/src/modules/previa/previa.service.test.ts` — 14 cenários
  preexistentes continuam passando (tripulacao continua derivado).
- Adicionar em sprint futura: testes específicos da função
  `buildComposicaoMf`.

## Próximas iterações

- **S9:** Escrita do MF via Puppeteer consome `composicaoMf` + aplicação de
  Conferência + Alterações Diversas.
- **S6b+1:** Migrar `whatsapp.ts` para usar `composicaoMf` direto;
  eventualmente remover `tripulacao` + `viaturasOperacionais` do schema.

## Referências

- [ADR-008 — Três fontes de Efetivo](./ADR-008-tres-fontes-efetivo.md)
- [ADR-009 — Viaturas: nomenclatura MF + origem + bloqueio](./ADR-009-viaturas-nomenclatura-mf-e-origem.md)
- [ADR-010 — Fontes da Prévia](./ADR-010-fontes-previa-do-dia.md)
- [ADR-012 — Estado do dia (Servico)](./ADR-012-estado-do-dia-servico.md)

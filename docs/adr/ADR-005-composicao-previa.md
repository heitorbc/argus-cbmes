# ADR-005 — Composição da Prévia do Mapa Força

**Status:** Aceito
**Data:** 2026-05-08
**Sprint:** S4
**Decisor:** 2º SGT Heitor Barcellos Coelho — Tech Lead

## Contexto

A Prévia do Mapa Força é o objeto de leitura mais usado pelo Fiscal antes do
turno: traz a equipe escalada do dia, a composição (quem é Chefe/Mot/Op de
cada viatura), o Fiscal de Serviço calculado, os itens IDEO previstos e a
lista de viaturas operacionais. Ela é gerada a partir de **5 fontes
independentes** já implementadas em sprints anteriores:

| Fonte                       | Origem dos dados        | Sprint  |
| --------------------------- | ----------------------- | ------- |
| `EscalasService`            | XLSX do Sargenteante    | S3b     |
| `EfetivoService` (QDI+EFET) | CSV público da planilha | S2/S2.5 |
| `FiscaisService`            | Cadastro mock in-memory | S3a     |
| `IdeoService`               | Cadastro mock in-memory | S3a     |
| `ViaturasService`           | Mock seed in-memory     | S2      |

A questão arquitetural: **onde mora a lógica de composição?** Distribuída em
cada controller, repetida no frontend, ou centralizada em um service dedicado?

Decisão Tech Lead: **service dedicado `PreviaService`** que orquestra as 5
fontes e devolve um único objeto `PreviaDoDia` consolidado. O frontend não
faz joins, não chama múltiplos endpoints, não conhece a regra de cálculo do
Fiscal — só renderiza o objeto pronto.

## Decisão

1. **Endpoint único `GET /previa?data=YYYY-MM-DD`** retorna `PreviaDoDia`
   completo. Sem RBAC adicional — todo usuário autenticado pode ler
   (Conferências futuras em S6 também consumirão).
2. **`PreviaService.getPreviaDoDia(dataIso)`** orquestra:
   1. `EscalasService.get(ano, mes)` → escala do mês (existência sinaliza
      `SEM_ESCALA_NO_MES` se ausente).
   2. `EscalasService.getEscaladosDoDia(ano, mes, dataIso)` → equipe + composição.
   3. `EfetivoService.getAll({ somente1aCia: true })` → lista para o `NomeMatcher`.
   4. Para cada linha da composição: resolve `MilitarRef → Militar` via
      `NomeMatcher`. Não-resolução vira inconsistência.
   5. `FiscaisService.getCadastradoVigente(equipe, data)` → override; se
      ausente, calcula default (menor ANT entre os escalados resolvidos).
   6. `IdeoService.get(dia, tipo)` para cada `TIPO_IDEO`. Ausentes viram
      `IDEO_NAO_CADASTRADO`.
   7. `ViaturasService.list().filter(operacional)` → viaturas vigentes;
      cruza com viaturas referenciadas pela escala (sinaliza `VIATURA_DESCONHECIDA`).
3. **Resolução nome→NF (`NomeMatcher`)** com 3 níveis de precisão:
   - **Nível 1 (mais preciso):** `posto + nomeGuerra` exato após normalização
     (uppercase, sem acentos, sem espaços nem ordinais no posto).
   - **Nível 2:** somente `nomeGuerra` (caso o XLSX tenha posto desatualizado).
   - **Nível 3 (token):** decompõe nome de guerra em tokens ≥2 chars e cruza
     — resolve casos como `D. MATTOS` (XLSX) ↔ `MATTOS` (QDI).
     Quando há ambiguidade no nível 2/3 e o posto bate em apenas 1 candidato, usa
     o filtro de posto como desempate. Caso contrário, devolve `null` +
     `ambiguidade=true` → vira `AMBIGUIDADE_NOME`.
4. **Inconsistências são acumuladas, não bloqueiam.** O Fiscal vê tudo o que
   foi parseado + uma lista clara de problemas detectados. Decisões de
   correção (cadastrar Fiscal manualmente, importar nova escala, atualizar
   IDEO) são responsabilidade humana.
5. **Tipos compartilhados em `packages/shared-types/src/previa.ts`:**
   `PreviaDoDia`, `PreviaTripulacaoEntry`, `PreviaFiscal`, `PreviaIdeoEntry`,
   `PreviaInconsistencia`, `TIPO_INCONSISTENCIA`. O frontend importa direto.
6. **Helper `previaMatchKey(posto, nomeGuerra)` em shared-types** — exportado
   porque o frontend pode (futuro) querer fazer match localmente para sugestões.

## Alternativas consideradas

- **Composição no frontend (chamadas paralelas a 5 endpoints):** rejeitada.
  Distribui a regra do cálculo do Fiscal entre frontend e backend; cada nova
  tela teria que reimplementar matching nome→NF; latência maior em mobile.
- **Persistir Prévia em DB:** rejeitada para Fase 1. O custo de
  invalidar/regenerar quando uma fonte muda (escala importada, fiscal
  cadastrado, IDEO editado) supera o benefício. Geração on-demand é trivial
  (~50ms in-memory). Em S5 (Supabase) pode-se materializar se virar
  bottleneck.
- **Matching fuzzy mais agressivo (Levenshtein, Jaro-Winkler):** rejeitada
  por enquanto. As 3 estratégias já cobrem os casos observados (BARCELLOS,
  D. MATTOS, CAUÊ LYRA, FABRE). Bibliotecas de fuzzy aumentam complexidade e
  geram falsos positivos perigosos em contexto militar (trocar militar é
  grave).

## Consequências

**Positivas:**

- Frontend simples: 1 chamada → render direto. Tela `/previa` tem ~280 linhas
  e zero lógica de negócio.
- Testes do `PreviaService` cobrem o cenário institucional canônico
  (23/04/2026 CHARLIE) end-to-end com mocks dos 5 services. 13 cenários,
  incluindo todas as 6 inconsistências modeladas.
- A Conferência da Equipe (S6) e a Parte Diária (S10) reusam o mesmo objeto
  `PreviaDoDia` — sem retrabalho.

**Negativas / riscos:**

- Acoplamento: `PreviaModule` importa 5 outros módulos. Em S5 (Prisma) qualquer
  troca de schema cascateia. Mitigação: tipos `Militar`/`ComposicaoEntry`/
  `IdeoEntry`/`Viatura`/`FiscalCadastrado` ficam estáveis em shared-types; só
  storage muda.
- Matching nome→NF é a parte mais frágil. Se o Sargenteante mudar nome de
  guerra de um militar no XLSX (ex.: deixar de usar "D. MATTOS" e passar a
  usar só "MATTOS"), o nível 2 resolve sozinho. Mas se mudar para algo
  completamente novo ("DANIEL"), vira inconsistência. **Mitigação operacional:**
  a tela mostra a inconsistência claramente; o Fiscal pode reportar ao
  Sargenteante para padronizar.
- Inconsistências silenciam-se quando NF do XLSX vem como `nf` preenchido
  (caso defensivo no `NomeMatcher.resolve`). Hoje o parser nunca preenche
  isso — política conservadora, evita "match acidental" via NF não validada.

## Tests

`apps/api/src/modules/previa/`:

- `nome-matching.test.ts` — 8 testes:
  match exato (posto+nomeGuerra), normalização de posto ("2º SGT" vs "2ºSGT"),
  acentos (CAUÊ LYRA), pontuação (D. MATTOS), ausência, ambiguidade, defensivo
  com NF preenchido.
- `previa.service.test.ts` — 13 testes:
  - Cenário CHARLIE 23/04/2026: composição completa, NFs resolvidos, Fiscal
    default = BARCELLOS (ANT 418), `isFiscal=true` na linha correta, cadastro
    explícito sobrepõe, IDEO incluído, viaturas filtradas por status.
  - Inconsistências: SEM_ESCALA_NO_MES, EQUIPE_NAO_ESCALADA_NO_DIA,
    NF_NAO_RESOLVIDO, IDEO_NAO_CADASTRADO, VIATURA_DESCONHECIDA,
    FISCAL_SEM_NF_RESOLVIDO.

Total acumulado: **110 testes** (97 antes do S4 + 13 PreviaService = 110;
NomeMatcher já contou em 97).

## Próximas iterações

- **S5:** com Prisma+Supabase, `PreviaService` continua igual — só os
  injectors mudam. Caso a geração comece a custar caro (>200ms), considerar
  cache LRU por `data`.
- **S6 (Conferência da Equipe):** o Fiscal vê a Prévia como ponto de partida
  e marca presenças/substituições. Estado da Conferência fica numa nova
  entidade `ConferenciaEquipe` que referencia o `PreviaDoDia` original.
- **S9 (Mapa Força — escrita):** o payload escrito na aba `1º BBM` é
  derivado direto da Prévia (com Conferências aplicadas).
- **S10/S11 (Parte Diária):** a maior parte das 17 seções vem da Prévia +
  Conferências.

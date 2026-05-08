# ADR-004 — Parser de Escala Mensal XLSX

**Status:** Aceito
**Data:** 2026-05-08
**Sprint:** S3b
**Decisor:** 2º SGT Heitor Barcellos Coelho — Tech Lead

## Contexto

O Sargenteante mantém a escala mensal das equipes A/B/C/D em planilhas XLSX
disponibilizadas em `data/Escala de Serviço/`. Cada planilha cobre um mês e tem
8-9 abas; somente as duas de calendário (`01 A 14 [MES]` e `15 A 29 [MES]`)
interessam ao parser. A investigação prévia (S3a, ver
[escala-xlsx-formatos.md](../integracoes/escala-xlsx-formatos.md)) mapeou três
seções estáveis dentro dessas abas:

1. **Cabeçalho institucional** (linhas 1-8) — texto fixo, ignorado.
2. **Mapa dia → equipe** (linhas 9-13) — datas em colunas e a letra da equipe
   escalada para aquele dia.
3. **Composição por viatura/função × equipe** (linhas 15-31) — para cada equipe,
   quem é Chefe/Mot/Op de cada viatura. Cada equipe ocupa 4 colunas redundantes.

A Fase 1 precisa parsear esse XLSX para alimentar a Prévia (S4), o cálculo de
Fiscal de Serviço (`getVigente`) e a Conferência da Equipe (S6).

## Decisão

1. **Biblioteca:** [ExcelJS](https://github.com/exceljs/exceljs) (já instalada
   em S3a). Suporta leitura de XLSX a partir de Buffer (multipart/form-data) e
   resolve fórmulas e datas serializadas corretamente.
2. **Identificação do mês/ano** é feita pelo **nome do arquivo** (ex.:
   `05 MAIO DE 2026.xlsx`), não pelo conteúdo. Isso permite rejeitar
   precocemente arquivos não-escala como `PROVA CHS.xlsx` e `dia da mulher.xlsx`,
   e tolera variantes de reupload (`...apos mergulho voltar.xlsx`,
   `... 11 A 15.xlsx`).
3. **Localização das abas mensais** é por regex no nome da aba
   (`/^0?1\s*A\s*1[34]\b/` e `/^1[45]\s*A\s*(?:29|30|31)\b/`), tolerante a
   abreviações de mês variadas (`MAI`, `MAIO`, `MAR`, etc.).
4. **Layout interno é heurístico, não posicional cego.** O parser:
   - Encontra o header de equipes (`EQUIPE A`/`EQUIPE B`/`EQUIPE C`/`EQUIPE D`)
     buscando entre as linhas 13 e 18, registrando a coluna inicial de cada equipe.
   - Cada equipe ocupa 4 colunas redundantes — o parser pega a **primeira não vazia**
     dentro do intervalo (algumas células ficam vazias por mesclagens).
   - Datas e letras de equipe ficam nas linhas 9-10 (datas, podem ser `Date`
     ou número) e 12-13 (letras), com fallback entre as duas linhas.
   - Linhas 16-32: leitura sequencial com **carry-forward** da viatura (col 1
     pode ficar vazia em sub-linhas como `Op 2`, `Op 3`).
5. **Saída estruturada** segue o tipo `EscalaMensal` declarado em
   `packages/shared-types/src/escala.ts`:
   ```typescript
   {
     mes: 5, ano: 2026,
     diaEquipe: { "2026-05-01": "C", ... },     // mapa dia → letra
     composicao: [{ equipe, viatura, funcao, militar }, ...],
     avisos: string[],                           // não-fatais
   }
   ```
6. **Avisos não-fatais** (NF não resolvido, célula com texto inesperado,
   composição divergente entre quinzenas) são acumulados em `avisos: string[]`
   e exibidos no preview ao usuário. **Avisos NÃO bloqueiam a confirmação** —
   o Admin/Sargenteante decide.
7. **Erros fatais** (nome inválido, abas ausentes, layout completamente fora
   do esperado, arquivo corrompido) são lançados como `EscalaXlsxParseError`
   com `code` discriminado, traduzido pelo controller em `400 Bad Request`.
8. **Fluxo de upload em duas etapas:**
   - `POST /escalas/preview` (multipart) — parseia, devolve `{ escala, diff }`
     **sem persistir**. Diff é calculado se já existe escala vigente daquele mês.
   - `POST /escalas/confirm` (JSON) — persiste o body recebido (idealmente o
     mesmo objeto retornado pelo preview).
9. **Resolução nome→NF é responsabilidade externa.** O parser produz `MilitarRef`
   com `postoAbreviado` e `nomeGuerra`, mas deixa `nf` opcional. A resolução é
   feita posteriormente cruzando com o QDI já carregado (`EfetivoService`) — em
   S4 (Prévia) ou S6 (Conferência). Isso mantém o parser puro e testável sem
   dependências.

## Alternativas consideradas

- **SheetJS (xlsx):** mais rápido em arquivos grandes, mas suporte a `Date`
  e ordem de leitura de células mesclados é menos previsível que ExcelJS. Para
  o nosso volume (≤ 50 KB por arquivo) ExcelJS é suficiente.
- **Posicional puro (`A4`/`B5`...):** rejeitado porque o XLSX tem células
  mescladas e o número de colunas redundantes pode mudar. Heurística é mais
  robusta a variações pequenas.
- **Heurística por conteúdo (sem usar nome do arquivo):** rejeitada porque
  permitiria aceitar arquivos que casualmente se parecem com escala (ex.:
  `dia da mulher.xlsx`, que pode ter cabeçalho institucional similar). O nome
  do arquivo é o sinal mais forte e é controlado pelo Sargenteante.

## Consequências

**Positivas:**

- Parser puro (entrada Buffer → saída JSON), sem efeitos colaterais. Testável
  com fixtures reais sem mocks.
- Diff é uma função pura sobre `EscalaMensal` × `EscalaMensal`, reutilizável
  em outros contextos (ex.: comparar escala oficial × escala extra).
- Suporta reupload mid-month sem perda de dados — o usuário sempre vê o que
  vai mudar antes de aceitar.

**Negativas / riscos:**

- Heurística depende do layout permanecer estável. Se o Sargenteante reorganizar
  o XLSX, o parser pode silenciosamente pular dados. Mitigação:
  `LAYOUT_INVALIDO` é lançado quando `diaEquipe` ou `composicao` ficam vazios;
  testes com 3 fixtures reais (abril, maio, junho) detectam regressões.
- Resolução nome→NF é deferida — funções abaixo do parser ainda podem precisar
  de matching fuzzy quando o QDI muda nome de guerra. Esse ônus fica para
  S4/S6.
- Storage in-memory (S3b) — em S5 migra para Prisma+Supabase. Schema da
  tabela `escala_mensal` espelhará exatamente o tipo `EscalaMensal` (JSONB
  em `diaEquipe` e `composicao` é a opção mais simples).

## Tests

- `apps/api/src/modules/escalas/escala-xlsx-parser.test.ts` — 15 testes:
  - `parseFilename`: padrões válidos, variantes de reupload, rejeições.
  - `parseMilitarCell`: padrões de posto+nome, casos especiais.
  - `parseEscalaXlsx`: 3 fixtures reais (`05 MAIO`, `04 ABRIL`, `06 JUNHO`)
    - reupload parcial (`05 MAIO 11 A 15`) + 2 casos de rejeição
      (`PROVA CHS`, `dia da mulher`).
- `apps/api/src/modules/escalas/escalas.service.test.ts` — 10 testes:
  service CRUD + `computeDiff` (dia mudou, militar trocou, posição
  removida, escalas idênticas).

## Próximas iterações

- **S4:** consumir `EscalasService.getEscaladosDoDia` na geração da Prévia.
- **S6:** durante a Conferência da Equipe, o Fiscal vê a composição parseada
  e marca presenças.
- **S5:** migrar `EscalasService` para Prisma. Schema preliminar:
  ```prisma
  model EscalaMensal {
    id              String   @id @default(cuid())
    ano             Int
    mes             Int
    origemArquivo   String
    importadoEm     DateTime @default(now())
    importadoPorNf  String?
    diaEquipe       Json     // Record<string, "A"|"B"|"C"|"D">
    composicao      Json     // ComposicaoEntry[]
    avisos          Json     // string[]
    @@unique([ano, mes])
  }
  ```

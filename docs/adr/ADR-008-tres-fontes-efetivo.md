# ADR-008 — Três fontes de Efetivo (DADOS > 1ª1º > EFETIVO)

**Status:** Aceito (revisado em 2026-05-09 pelo S6a-fix item 2)
**Data:** 2026-05-09
**Sprint:** S6a (revisado em S6a-fix)
**Decisor:** 2º SGT Heitor Barcellos Coelho — Tech Lead

> **Nota S6a-fix (2026-05-09):** EFETIVO contribui apenas para
> **enriquecimento** de campos demográficos (idade, serviço, município)
> de militares já presentes em DADOS+1ª1º. NFs novas vêm exclusivamente
> de DADOS (com LOCAL=1ª1º) ou de 1ª1º. Antes do fix, militares só
> presentes em EFETIVO geral (ex.: CAP ALAN NF 3269779, TEN ALINE NF 4544935) vazavam para a lista da 1ª Cia. Veja `mergeThreeSources()`
> em [efetivo.service.ts](../../apps/api/src/modules/efetivo/efetivo.service.ts).

## Contexto

Após o S2.5 a consolidação do Efetivo usava 2 fontes:

- **QDI aba 1ª1º** (gid `558859373`) — visão operacional pré-filtrada
  para a 1ª Cia, com nome de guerra, posto atual, sub-seção (staff/sos/guarda/aquaticas)
- **EFETIVO - DADOS GERAIS** (CSV público do Sargenteante) — visão demográfica
  do CBMES inteiro: nome completo, idade, serviço, município

Limitação observada: **a aba 1ª1º não tem todos os campos disciplinares e
operacionais** (CNH, conceito, pontos, incorporação, mergulho, FTBA, etc.).
Esses dados moram na **aba `DADOS`** do mesmo QDI (gid `1395786516`), que é
a tabela completa do CBMES filtrada por coluna `LOCAL` para a 1ª Cia.

A pedido do Tech Lead em 2026-05-09, o ARGUS deve usar a aba DADOS como
**primária** (mais detalhada), mantendo a 1ª1º como complementar (mais
atualizada operacionalmente pelo DRH) e o EFETIVO como fallback.

## Decisão

**3-way merge na ordem `DADOS > 1ª1º > EFETIVO` no `EfetivoService.consolidate`.**

### Layout da aba DADOS (gid 1395786516)

Verificado em 2026-05-09 (snapshot em
`apps/api/src/modules/efetivo/__fixtures__/qdi-dados-2026-05-09.csv`):

| Col   | Conteúdo                                      | Exemplo                   |
| ----- | --------------------------------------------- | ------------------------- |
| 0     | NF DUPLICADO (flag, ignorar)                  | "1"                       |
| 1     | NF                                            | "3037509"                 |
| 2     | ANT                                           | "418"                     |
| 3     | POST/GRAD                                     | "2ºSGT"                   |
| 4     | NOME DE GUERRA                                | "BARCELLOS"               |
| 5     | NOME (completo)                               | "HEITOR BARCELLOS COELHO" |
| 6     | RESIDENCIA (SIARHES)                          | "VITORIA"                 |
| 7     | LOCAL (lotação) ← **FILTRO**                  | "1ª1º"                    |
| 8     | CLASSE                                        | "ADM 11", "PRONT 11"      |
| 12    | SITUAÇÃO                                      | "APTO", "FÉRIAS"          |
| 16    | CONCEITO DISCIPLINAR                          | "CD-A", "CD-B"            |
| 17    | PONTOS                                        | "100", "80"               |
| 18-19 | CNH + VALIDADE                                | "AB" / "12/02/2024"       |
| 20-26 | MERG / FTBA / CENSO / CCVE / ETSP + validades | "SIM", "NÃO"              |
| 27    | INCORPORAÇÃO                                  | "19/03/2001"              |
| 28    | PLANO DE FÉRIAS                               | "NOV"                     |

### Estratégia de merge

```typescript
function mergeThreeSources(dados, qdi1cia, efetivo) {
  for (const nf of allNfs) {
    let m = baseFrom(efetivo);             // EFETIVO: idade, serviço, município
    if (qdi1cia) m = override(m, qdi1cia); // 1ª1º: subSecao, função, postoPrevisto
    if (dados)  m = override(m, dados);    // DADOS: ANT, posto, classe, CNH, etc.
    m.origensFonte = ['DADOS', '1ª1º', 'EFETIVO'].filter(...);
  }
}
```

**Regra de ouro:** dados mais ricos vencem; dados mais atuais sobrescrevem
mais antigos. Ausência de uma fonte não falha o merge — degrada
graciosamente (com `stale=true` se falha foi recente).

### Campos novos no tipo `Militar`

`packages/shared-types/src/militar.ts` ganhou:

- `lotacao` (LOCAL — sempre vem de DADOS)
- `classe` (ADM 11 / PRONT 11 / GUARD 11 / etc.)
- `conceitoDisciplinar`, `pontos`, `cnh`, `cnhValidade`
- `incorporacao`, `planoFerias`
- `mergulho`, `ftba`, `etsp`, `ccve`, `ccveValidade`, `censo`
- `origensFonte: ('DADOS' | '1ª1º' | 'EFETIVO')[]` — debug do que contribuiu

Todos opcionais para retrocompat — telas antigas continuam funcionando.

### Página de detalhe

`/cadastros/efetivo/:nf` (nova) consome `efetivo.findByNf(nf)` (já existia)
e exibe todos os campos agrupados em cards: Identificação, Lotação,
Funcional, Habilitação e Cursos, Pessoal. Badge `origensFonte` mostra
quais fontes contribuíram.

## Alternativas consideradas

- **Manter 2-way merge e ler campos extras só sob demanda:** rejeitada porque
  duplicaria a lógica de fetch para casos comuns (página de detalhe acessa
  CNH/incorporação que ficariam fora do consolidado padrão).
- **Tornar EFETIVO a primária:** rejeitada porque EFETIVO não tem dados
  específicos da 1ª Cia (subseção, função operacional).
- **Ler aba DADOS apenas no detalhe (lazy):** rejeitada — duplicaria a
  responsabilidade de consolidação.

## Consequências

**Positivas:**

- Página de detalhe rica sem novos endpoints (`findByNf` já consolida tudo).
- `EfetivoService.getAll({ somente1aCia })` filtra militares cuja
  `subSecao` está definida — semântica preservada (1ª Cia = qualquer um com
  sub-seção do QDI).
- Quando o DRH atualiza a aba 1ª1º (mais atualizada que DADOS para
  mudanças operacionais), essas mudanças vencem sobre DADOS conforme a
  ordem do merge — comportamento desejado pelo Tech Lead.

**Negativas:**

- 3 chamadas HTTP a Google Sheets em vez de 2 (mas todas em cache TTL 5min,
  custo amortizado).
- Tipo `Militar` cresceu (~12 campos novos, todos opcionais). Pode poluir
  serializações se não tomar cuidado com `Pick<>`/`Omit<>` em telas
  específicas.
- Coluna LOCAL pode ter variações ("1ª1º" vs "1ª/1º") — parser aceita
  ambas, mas se aparecer outra variante (ex.: "1ª CIA / 1º BBM"),
  precisa adicionar à whitelist `locaisAceitos`.

## Tests

`apps/api/src/modules/efetivo/`:

- `qdi-dados-csv-parser.test.ts` — 7 cenários: filtra por LOCAL, inclui
  BARCELLOS/D. MATTOS, captura pontos/CNH/incorporação, filtro vazio rejeita,
  CSV vazio tolerado.
- `efetivo.service.test.ts` — 13 cenários (preexistentes, mantidos com
  warnings de QdiDadosService indisponível em testes).

Total acumulado backend: 151 (era 131 → +20: 7 parser DADOS + 12 viaturas refator + 6 escala especial + 5 service especial - 10 viaturas antigos).

## Próximas iterações

- **S6b:** PreviaService consome `lotacao`, `classe` etc. para preenchimento
  do MF.
- **S5b:** `Militar` migra para Prisma; campos novos viram colunas; merge é
  feito por triggers ou job de sincronização.

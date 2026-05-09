# ADR-006 — Leitura do Mapa Força via CSV público

**Status:** Aceito
**Data:** 2026-05-09
**Sprint:** S5
**Decisor:** 2º SGT Heitor Barcellos Coelho — Tech Lead

## Contexto

O Mapa Força é a planilha CIODES compartilhada entre todas as OBMs do CBMES.
A aba `1º BBM` (gid `1468029336`) é mantida pelo Sargenteante / Fiscal do Dia
e contém:

- A relação atual entre **Recurso** (nome funcional da equipe) → **Viatura**
  (prefixo) → **Status** da viatura (col C: DISPONÍVEL / BAIXADA / EMPRESTADA)
- A composição operacional: Chefe, Motorista, Operadores 1-4 por recurso
- Recursos institucionais que **não estão na escala XLSX** da SOS — em
  particular MERGULHO 01/02 do Pelotão de Atividades Aquáticas
- Fiscal de Serviço do Dia (linha 5)

Após o S4 o ARGUS gerava a Prévia apenas com a escala XLSX do Sargenteante,
deixando de fora:

1. A equipe de Mergulho (não está no XLSX da SOS)
2. O status real das viaturas (TE_110 estava marcada como "operacional" pelo
   mock seed quando na realidade está BAIXADA)
3. Outras equipes fixas (Salvamar, ChefeOp staff, Oficial de Dia)

A questão: **como ler o Mapa Força sem credenciais?** O Tech Lead já rejeitou
em sprints anteriores o uso de Service Account (ADR-003). Para a escrita do
Mapa Força (S9) vai ser usado Puppeteer + conta institucional. Para leitura?

## Decisão

**Espelhar o padrão do ADR-003 (CSV público) também para o Mapa Força.**

Razões:

- **A planilha já está aberta para leitura na URL pública**: o link `/export?format=csv&gid=...`
  funciona sem auth (verificado via curl em 2026-05-09), assim como o EFETIVO e o QDI.
- **Custo zero, performance previsível**: cache TTL 5min in-memory + fallback stale,
  exatamente como `EfetivoService` e `QdiService`.
- **Não causa problema institucional**: o Mapa Força é um instrumento
  oficial de comunicação operacional, compartilhado entre OBMs por design.
  Leitura via export CSV é equivalente a um humano abrir a planilha pelo
  navegador.
- **Não compromete a estratégia de S9 (escrita)**: continuamos planejando
  Puppeteer + conta institucional para escrita, pois o export CSV é read-only.

## Estrutura do parser

Layout posicional verificado em 2026-05-09 (snapshot em
`apps/api/src/modules/mapa-forca/__fixtures__/mapa-forca-2026-05-08.csv`):

| Col | Conteúdo              |
| --- | --------------------- |
| A   | RECURSO               |
| B   | VTR (prefixo)         |
| C   | VTR - SITUAÇÃO        |
| D   | VTR SEM EQUIPE (flag) |
| E   | CHEFE                 |
| F   | MOTORISTA             |
| G-J | OPERADOR 1-4          |
| K   | Nº de Militares       |

O parser:

- Identifica início/fim do bloco da 1ª Cia procurando recursos válidos da
  whitelist (`RECURSOS_VALIDOS` no parser) e parando em `EQUIPAMENTOS`.
- Pula a linha `SOMA DE RECURSO DE PRONTO EMPREGO...` que aparece no meio do
  bloco (entre REPDEC 02 e DRO/TELEFONISTA).
- Mapeia `VTR - DISPONIVEL`/`BAIXADA`/`EMPRESTADA`/`NAO POSSUI` → enum `StatusVtr`.
- Extrai Fiscal do Dia da linha 5 (campo `fiscalDoDia` opcional).

## Como o ARGUS consome

1. `MapaForcaService.getRecursos()` — fonte primária.
2. `ViaturasService.list()` derivou completamente dos recursos (fim do mock
   seed). Status, prefixo e tipo de viatura vêm do MF. Admin pode criar
   overrides locais.
3. `PreviaService.getPreviaDoDia` complementa a tripulação com:
   - Mergulho (RECURSOS_AQUATICAS) → equipe `'AQUATICAS'`, funções `M1`/`M2`/...
   - Staff fixo (RECURSOS_STAFF: ChefeOp, OficialDia, Peritos) → equipe `'STAFF'`

## Riscos / mitigações

- **Layout do MF pode mudar**: o Sargenteante/CIODES podem reorganizar a
  planilha. Mitigação: parser validado contra fixture; whitelist de recursos
  válidos; falha explícita se 0 recursos detectados (não-silenciosa).
- **Cache 5min pode ser muito longo se for crítico**: o Sargenteante
  edita o MF ao longo do dia. Aceitável para Fase 1; Conferência (S6)
  pode adicionar SSE ou polling mais agressivo.
- **Concorrência leitura/escrita**: leitura ARGUS pode pegar um snapshot
  intermediário (Sargenteante editando enquanto baixamos o CSV). Aceitável
  — próximo refresh corrige.

## Tests

- `apps/api/src/modules/mapa-forca/mapa-forca-csv-parser.test.ts` — 7 cenários:
  total de recursos, MERGULHO 01/02 detectados, ABTS_01 com 3 militares,
  GUARDA com 3 sentinelas em ops, PLATAFORMA BAIXADA, Fiscal do Dia
  extraído, CSV truncado tolerado.
- `apps/api/src/modules/viaturas/viaturas.service.test.ts` — 10 cenários
  cobrindo o mapeamento prefixo→tipo, status→status, override admin.

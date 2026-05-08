# ADR-003 — Leitura programática de planilhas Google via CSV público

**Data:** 2026-05-08
**Status:** Aceito
**Sprint:** S2
**Decisor:** 2º SGT Heitor Barcellos Coelho (Tech Lead)

## Contexto

A Fase 1 do ARGUS precisa ler dados de duas planilhas Google institucionais:

1. **Planilha de Efetivo do Sargenteante** — fonte de verdade do efetivo (NF, ANT, posto, nome).
   Acesso necessário desde S2.
2. **Mapa Força do CIODES (aba "1º BBM")** — célula A4 (timestamp) + composição do turno.
   Leitura necessária desde S5 (status PREENCHIDO/PENDENTE).

A decisão original do Plano de Sprints (S2 Tarefa #1) previa Service Account Google. O Tech Lead
rejeitou Service Account em duas iterações sucessivas (2026-05-08), citando bloqueio operacional
para obter aprovação de SA na planilha do CIODES (decisão registrada em ADR-006 quando S9 começar).

Verificou-se em 2026-05-08, via `curl` ao endpoint de export CSV do Google Sheets, que **a
planilha de Efetivo (gid=1379090962) é publicamente acessível com a configuração "Qualquer pessoa
com o link pode visualizar"** — basta um HTTP GET, sem qualquer credencial:

```
https://docs.google.com/spreadsheets/d/{ID}/export?format=csv&gid={GID}
```

## Decisão

**Para LEITURA de planilhas Google compartilhadas como "anyone with link":** usar export CSV
público via `fetch` nativo do Node 20+. Nenhuma autenticação, nenhuma biblioteca
`googleapis`/OAuth/SA.

Implementação concreta no módulo `EfetivoModule` (`apps/api/src/modules/efetivo/`):

- **Cache in-memory com TTL de 5 minutos** (`EfetivoService.cache`) — evita martelar o Google a
  cada requisição e mantém latência baixa
- **Lock de concorrência via `inflight: Promise`** — chamadas concorrentes durante miss aguardam
  o mesmo fetch
- **Fallback gracioso** — se um resync falha, serve último snapshot com `stale: true` e log de
  erro; só lança 503 se nunca houve sucesso
- **Parser tolerante** (`efetivo-csv-parser.ts`) — usa `csv-parse/sync`; lookup por nome de
  cabeçalho (não posição); descarta linhas com NF/ANT/posto/nome vazios (linhas-resumo)
- **Timeout de 15s** no `fetch` (AbortController) para não travar requisições do frontend

Endpoints expostos:

- `GET /efetivo?q=&page=&pageSize=&somente1aCia=` — paginado, busca em NF/nome/nomeGuerra/posto, ordenado por ANT
- `GET /efetivo/:nf` — lookup individual (consolidado com QDI)
- `POST /efetivo/sync` — `@Roles('admin')` — força resync ignorando cache (mantém snapshot anterior se falhar)

## Consolidação QDI + EFETIVO (S2.5, 2026-05-08)

A planilha de Efetivo do Sargenteante lista todo o CBMES (228 militares), sem identificação de
unidade nem nome de guerra. Para uso operacional na 1ª Cia, S2.5 adiciona uma segunda fonte: a
**Planilha QDI** (Quadro de Distribuição Interna do 1º BBM, ID `12-XCsNwr34d625Wkkuq-mr4bmv2Fcr2QQ1C7WfVjwB0`,
gid `558859373`), também pública via export CSV.

### Estrutura do QDI

CSV "planilhão" com seções por unidade (sem coluna LOCAL — uso parsing por seção):

| Seção do QDI                             | `subSecao`  | Unidade                                            |
| ---------------------------------------- | ----------- | -------------------------------------------------- |
| `1ªCIA/1ºBBM - VITÓRIA`                  | `staff`     | 1ª Cia / 1º BBM — Comando                          |
| `SEÇÃO DE OPERAÇÕES DE SALVAMENTO (SOS)` | `sos`       | 1ª Cia / 1º BBM — Seção de Operações de Salvamento |
| `GUARDA QCG`                             | `guarda`    | 1ª Cia / 1º BBM — Guarda QCG                       |
| `PELOTÃO DE ATIVIDADES AQUÁTICAS`        | `aquaticas` | 1ª Cia / 1º BBM — Pelotão de Atividades Aquáticas  |

Outras seções (1ºBBM staff, SAT, MILITARES EM EXCESSO, RESUMO) são ignoradas.

Layout posicional (não confiar em headers — eles são parciais e desalinhados com data rows):
col 1=ANT, col 2=NF, col 4=função, col 5=code (PRONT 11/ADM 11/GUARD 11/PRONT AA),
col 6=posto previsto, **col 7=posto atual**, **col 8=nome de guerra**, col 13=situação.

Reservistas (ANT="RR ###") e slots vagos (`--`) são descartados. Adidos (PRONT CERD, ADM DGP) são
mantidos com `situacao='ADIDO'` para visibilidade institucional.

### Estratégia de merge (decisão Tech Lead 2026-05-08)

- **União de NFs** entre EFETIVO e QDI (left-join por NF)
- **QDI vence em** ANT, posto atual, situação, função (operacional)
- **EFETIVO mantém** nome completo, idade, tempo de serviço, município (demográfico)
- **Militares só no QDI** entram com `nome = nomeGuerra` (fallback obrigatório do schema)
- **Militares só no EFETIVO** entram sem `subSecao` — não aparecem no filtro `?somente1aCia=true`

`mergeSources()` em `apps/api/src/modules/efetivo/efetivo.service.ts` implementa o merge.

### Display name

`formatDisplayName(m)` em `@argus/shared-types`:

- Se `nomeGuerra` existe: `${posto} ${nomeGuerra}` (ex.: `2ºSGT BARCELLOS`)
- Senão: `${posto} ${primeiroNome(nome)}` (fallback)

### Bug fix do mock-users (S1)

Identificado durante a investigação: S1 mapeou Sargenteante para NF 903581 (ANDERSON MATTOS SIMOES,
SAT), mas o Sargenteante real da 1ª Cia é NF 2982390 (DANIEL DE AMORIM MATTOS, "D. MATTOS").
Corrigido em S2.5.

## Consequências

### Positivas

- **Zero credenciais para gerenciar** na Fase 1 — não há JSON de SA, não há refresh token, nada
  que possa vazar
- **Setup imediato** — não depende de aprovações institucionais (CIODES, GCP) que estavam
  bloqueadas
- **Trivial de testar** — `vi.stubGlobal('fetch', ...)` cobre o fluxo inteiro
- **Reusável para Mapa Força (S5)** — leitura da célula A4 segue o mesmo padrão (verificar antes
  do S5 que o gid=1468029336 também é público)

### Negativas / Trade-offs

- **Depende da configuração de compartilhamento da planilha** — se o Sargenteante mudar a
  permissão para "restrito", o ARGUS quebra silenciosamente (mostra stale snapshot até alguém
  notar). Mitigação: monitoramento + alerta no log
- **Sem rate-limit oficial** — Google pode estrangular IPs que abusam. Cache de 5min mantém
  esperando ~12 fetches/hora — bem abaixo de qualquer limite razoável
- **Dados sensíveis publicamente acessíveis** — issue institucional separada (CPFs reais expostos
  no CSV). Não é causada pelo ARGUS, mas o ARGUS lê da mesma origem. **Comunicar ao
  Sargenteante e DPO.**
- **Não cobre escrita** — para escrever no Mapa Força (S9) será necessário browser automation
  Puppeteer (decisão final do Tech Lead em 2026-05-08) ou Service Account pós-validação Fase 1.
  Detalhe em ADR-006 (S9)

## Alternativas consideradas

1. **Google Sheets API v4 com OAuth User Delegation** — descartada: exige projeto GCP + OAuth
   Client ID + refresh token; o Tech Lead não tem acesso ao painel admin
2. **Google Sheets API v4 com Service Account** — descartada pelo Tech Lead em 2026-05-08
   (impasse operacional para aprovação SA na planilha do CIODES)
3. **Browser automation (Puppeteer) para leitura** — descartada para leitura: exagero quando o
   CSV público resolve. Reservada para escrita do Mapa Força (S9)
4. **Sincronização batch para Postgres** — descartada para S2: sem persistência real ainda
   (chega em S5). Cache in-memory é suficiente

## Verificação

```bash
# Smoke test direto contra Google
curl -sL "https://docs.google.com/spreadsheets/d/1gA17VKQNV8xlnqIhAJfu57TW1GS6VH2YDrcJZk405do/export?format=csv&gid=1379090962" | head -5

# Smoke test via API ARGUS
curl -X POST http://localhost:3000/auth/login -H "Content-Type: application/json" \
  -d '{"nf":"3037509","senha":"11122233344"}' -c /tmp/c.txt
curl "http://localhost:3000/efetivo?q=BARCELLOS" -b /tmp/c.txt
# → {"items":[{"nf":"3037509","ant":419,...}],"total":1,"stale":false,...}
```

Cobertura de testes (Vitest):

- `efetivo-csv-parser.test.ts` — 4 testes (parse, ordenação, campos opcionais, vazio)
- `efetivo.service.test.ts` — 8 testes (paginação, busca, cache, fallback stale, falha sem snapshot, findByNf)

## Referências

- PRD v2.0 §5.2 (RF-CM-101, RF-CM-102)
- Plano de Sprints S2
- ADR-002 (auth strategy, contexto de auth interno do ARGUS)
- Memória `feedback_audit_decision.md` (decisão final sem auth Google)
- [Google Docs export URLs documentation](https://developers.google.com/sheets/api/concepts/access#sharing_modes)

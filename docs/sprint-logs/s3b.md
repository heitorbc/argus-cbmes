# Sprint S3b — Parser de Escala Mensal XLSX

**Data:** 2026-05-08
**Foco:** Parser XLSX completo + endpoints upload/preview/confirm/diff + tela `/cadastros/escalas`
**Tech Lead:** 2º SGT Heitor Barcellos Coelho

## Critérios de Pronto S3b (DoD)

- [x] `EscalaXlsxParser` consome Buffer + filename → `EscalaMensal` estruturado
- [x] Identificação de mês/ano pelo nome do arquivo (rejeita `PROVA CHS`, `dia da mulher`)
- [x] Localização de abas mensais por regex tolerante (`01 A 14 MAI`, `15 A 29 MAI`, etc.)
- [x] Extração de mapa dia → equipe (rows 9-13) com fallback entre linhas
- [x] Extração de composição equipe × viatura × função com carry-forward de viatura
- [x] Avisos não-fatais acumulados em `EscalaMensal.avisos`
- [x] Erros fatais discriminados via `EscalaXlsxParseError.code`
- [x] `EscalasService` (mock in-memory) com `list/get/save/delete/getEscaladosDoDia`
- [x] `computeDiff(antes, depois)` retorna diff de calendário e composição
- [x] Endpoints REST: `POST /escalas/preview` (multipart), `POST /escalas/confirm`,
      `GET /escalas`, `GET /escalas?ano&mes`, `GET /escalas/escalados-do-dia`,
      `DELETE /escalas/:ano/:mes`
- [x] Tela `/cadastros/escalas` com upload + preview + diff + confirmação + lista
- [x] ADR-004 emitido
- [x] 15 testes do parser + 10 testes do service = +25 testes (89 totais, era 64)
- [x] Pipeline: lint+format+typecheck+test+build verdes

## Entregas

### Backend (apps/api)

- `apps/api/src/modules/escalas/escala-xlsx-parser.ts` — parser puro Buffer→`EscalaMensal`
  - `parseFilename`, `parseMilitarCell`, `parseEscalaXlsx`, `EscalaXlsxParseError`
- `apps/api/src/modules/escalas/escala-xlsx-parser.test.ts` — 15 testes (3 fixtures reais)
- `apps/api/src/modules/escalas/escalas.service.ts` — storage mock + `computeDiff` exportado
- `apps/api/src/modules/escalas/escalas.service.test.ts` — 10 testes
- `apps/api/src/modules/escalas/escalas.controller.ts` — endpoints REST
- `apps/api/src/modules/escalas/escalas.module.ts`
- `apps/api/src/app.module.ts` — registra `EscalasModule`

### Frontend (apps/web)

- `apps/web/src/pages/escalas.tsx` — tela completa (upload + preview + diff + lista + detalhe)
- `apps/web/src/lib/api.ts` — `escalasList`, `escalasGet`, `escalasPreview`, `escalasConfirm`,
  `escalasDelete`, `escalasEscaladosDoDia`
- `apps/web/src/router.tsx` — rota `/cadastros/escalas`
- `apps/web/src/pages/home.tsx` — card "Escala Mensal (XLSX)" no grid

### Shared types

- `packages/shared-types/src/escala.ts` — `EscalaMensal`, `MilitarRef`, `ComposicaoEntry`,
  `EscalaDiff`, `PreviewEscalaResponse`, `LETRA_EQUIPE`, `LETRA_EQUIPE_LABEL`
- `packages/shared-types/src/index.ts` — re-export

### Documentação

- `docs/adr/ADR-004-parser-escala-xlsx.md` — decisão completa do parser
- `docs/sprint-logs/s3b.md` (este arquivo)

### Dependências adicionadas

- `@types/multer` (apps/api, dev) — tipagem de `FileInterceptor`. `multer` em si já vem
  transitivo via `@nestjs/platform-express`.

## Verificação end-to-end

```bash
# Login (Admin)
curl -X POST http://localhost:3000/auth/login -H "Content-Type: application/json" \
  -d '{"nf":"3037509","senha":"<sua-senha>"}' -c /tmp/c.txt

# Upload da escala de maio 2026 (preview, sem persistir)
curl -X POST http://localhost:3000/escalas/preview -b /tmp/c.txt \
  -F "file=@data/Escala de Serviço/05 MAIO DE 2026.xlsx" | jq '.escala | {mes, ano, dias: (.diaEquipe|keys|length), posicoes: (.composicao|length)}'

# Confirmar (envia o JSON do preview de volta — a tela faz isso automaticamente)
# Para teste manual: pegar o body do preview e POSTar em /escalas/confirm

# Listar escalas vigentes
curl http://localhost:3000/escalas -b /tmp/c.txt | jq

# Buscar escalados do dia 23/04/2026 (CHARLIE) — após importar abril
curl "http://localhost:3000/escalas/escalados-do-dia?ano=2026&mes=04&data=2026-04-23" -b /tmp/c.txt | jq
```

Frontend: http://localhost:5173 → home tem 5º card "Escala Mensal (XLSX)" → upload do XLSX
real (`data/Escala de Serviço/05 MAIO DE 2026.xlsx`) → preview com 4 equipes + 28 dias + ~50
posições → confirmar → aparece na lista.

## Achados durante a implementação

- **`Buffer<ArrayBufferLike>` vs `Buffer` no Node 20+:** ExcelJS tem tipagem antiga; resolvido
  com cast `as unknown as ArrayBuffer` no `wb.xlsx.load`.
- **Datas em células podem vir como `Date`, número ou string** dependendo de como o XLSX foi
  salvo. `cellAsDayOfMonth` cobre os três casos com `getUTCDate()` para evitar off-by-one.
- **Células mescladas** preenchem só a primeira; o parser pega a primeira não-vazia entre as
  4 colunas redundantes da equipe. Funciona em todas as 6 fixtures auditadas.
- **Linha 16 da aba canônica** ("MOT CH OP") tem viatura vazia em col 1 — função vai em col 2.
  Carry-forward de viatura mantém estado entre sub-linhas, mas para essa primeira linha o
  parser deixa `viatura = ""`. **Se isso for desejável separar como viatura "AU 154" será
  decisão de S4** (depende de como a Prévia consome esses dados).
- **Composição entre quinzenas:** quase idêntica em todas as fixtures, mas pode divergir
  pontualmente (ex.: 05 MAIO tem `2º SGT ALEXANDRE` em DELTA na 2ª quinzena, substituindo
  `3º SGT HOMERO` da 1ª). Resolvido via `mergeComposicao` com aviso.

## Métricas

- **Arquivos modificados:** ~9 novos + 4 atualizados (api: 5 novos, web: 1 novo + 3 mod,
  shared-types: 1 novo + 1 mod, docs: 2 novos)
- **Testes:** 64 (S3a) → **89** (S3b) — +25 (15 parser + 10 service)
- **Linhas de código:** ~+1500
- **Pipeline:** lint ✅ format ✅ typecheck ✅ test (89 verdes) ✅ build ✅

## Próximo passo (S4 — Prévia do Mapa Força)

Com S3b concluído, todos os pré-requisitos de leitura para a Prévia estão presentes:

- Efetivo + QDI ✓ (S2/S2.5)
- Viaturas ✓ (S2)
- Fiscais ✓ (S3a)
- IDEO ✓ (S3a)
- Escala mensal parseada ✓ (S3b — este sprint)

S4 vai compor a Prévia diária a partir de:

1. `escalasService.getEscaladosDoDia(ano, mes, data)` → equipe + composição
2. `fiscaisService.getVigente(equipe, data, escalados)` → quem é o Fiscal
3. `viaturasService.list()` + `efetivoService.findByNf(nf)` → enriquecimento
4. `ideoService.get(dia, tipo)` → itens de entrega

Estimativa S4: 8-10 dias úteis (escopo do plano original).

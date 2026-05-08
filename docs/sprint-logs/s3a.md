# Sprint S3a — Fiscais + IDEO + Investigação XLSX

**Data:** 2026-05-08
**Foco:** Cadastro de Fiscais (override) + Tabela IDEO + investigação prévia da estrutura dos XLSX para S3b
**Tech Lead:** 2º SGT Heitor Barcellos Coelho

## Decisão de escopo

S3 (Cadastros — Fiscais + Escala XLSX + IDEO) tinha estimativa original de 7-10 dias. A investigação
preliminar da estrutura dos XLSX revelou complexidade significativa (matriz dia × equipe × viatura ×
função, com mapeamento dia→equipe separado, reuploads parciais, e variantes não-escala em data/).

Tech Lead optou por **dividir em S3a (agora) + S3b (próxima sessão)**:

- S3a: Investigação XLSX documentada + Fiscais + IDEO + telas (~1,5d)
- S3b: Parser XLSX completo + upload/preview/confirm/diff + tests com fixtures + ADR-004 (~4-5d)

Vantagens: commits/PRs menores e revisáveis; valor entregue cedo; parser XLSX recebe sessão dedicada.

## Critérios de Pronto S3a (DoD)

- [x] Investigação XLSX documentada em `docs/integracoes/escala-xlsx-formatos.md` (10 arquivos auditados, layout das abas `01 A 14 [MES]` e `15 A 29 [MES]` mapeado posicionalmente)
- [x] FiscaisModule: cadastro mock + endpoints (list, create, delete, cadastrado-vigente, vigente)
- [x] Cadastro com vigência opcional + equipe opcional (curinga); cadastro específico vence sobre genérico
- [x] `getVigente(equipe, data, escalados)` aplica regra completa: cadastro → default (menor ANT)
- [x] Tela `/cadastros/fiscais` com formulário + lookup do militar por NF + lista
- [x] IdeoModule: CRUD mock por (dia, tipo); upsert sobrescreve
- [x] Tela `/cadastros/ideo` matriz 31×2 editável por célula (apenas Admin)
- [x] Router + home com 4 cards de Cadastros (Efetivo, Viaturas, Fiscais, IDEO)
- [x] Tests: 64 totais (15 novos — 11 Fiscais + 5 IDEO + correções)
- [x] Pipeline: lint+format+typecheck+test+build verdes

## Achados da investigação XLSX (resumo)

10 arquivos em `data/Escala de Serviço/`:

- 7 escalas mensais padrão (jan-jun 2026, todas com mesmo layout)
- 2 reuploads parciais (`02 FEVEREIRO ... apos mergulho voltar.xlsx`, `05 MAIO ... 11 A 15.xlsx`)
- 2 não-escala (`PROVA CHS.xlsx`, `dia da mulher.xlsx` — devem ser rejeitados pelo parser)

Cada XLSX tem 8-9 abas; apenas `01 A 14 [MES]` e `15 A 29 [MES]` interessam ao parser.

Estrutura interna em 3 seções:

1. **Mapa dia → equipe** (linhas 9-13, cols 2-15): qual equipe está escalada para cada dia
2. **Composição por viatura/função × equipe** (linhas 15-31): para cada equipe, quem é Chefe/Mot/Op de cada viatura. Cada equipe ocupa 4 cols (redundância de layout)
3. Férias e observações (linhas 33+): opcional para S4 (Prévia)

Detalhes em [docs/integracoes/escala-xlsx-formatos.md](../integracoes/escala-xlsx-formatos.md).

## Entregas

### Backend (apps/api)

- `apps/api/src/modules/fiscais/fiscais.module.ts`
- `apps/api/src/modules/fiscais/fiscais.service.ts` — `getCadastradoVigente`, `getVigente` (cadastro → default por menor ANT)
- `apps/api/src/modules/fiscais/fiscais.controller.ts` — endpoints REST
- `apps/api/src/modules/fiscais/fiscais.service.test.ts` — 11 testes
- `apps/api/src/modules/ideo/ideo.module.ts`
- `apps/api/src/modules/ideo/ideo.service.ts` — upsert/get/delete por (dia, tipo)
- `apps/api/src/modules/ideo/ideo.controller.ts`
- `apps/api/src/modules/ideo/ideo.service.test.ts` — 5 testes
- `apps/api/src/app.module.ts` — registra FiscaisModule + IdeoModule

### Frontend (apps/web)

- `apps/web/src/pages/fiscais.tsx` — formulário + lookup de militar por NF + lista de cadastros
- `apps/web/src/pages/ideo.tsx` — matriz 31×2, edição inline por célula
- `apps/web/src/lib/api.ts` — `fiscais*` e `ideo*` adicionados
- `apps/web/src/router.tsx` — rotas `/cadastros/fiscais` e `/cadastros/ideo`
- `apps/web/src/pages/home.tsx` — cards de navegação atualizados (4 cadastros)

### Shared types

- `packages/shared-types/src/fiscal.ts` — Zod schemas: `FiscalCadastrado`, `CreateFiscalInput`, `FiscalVigente`
- `packages/shared-types/src/ideo.ts` — Zod schemas: `IdeoEntry`, `UpsertIdeoEntryInput`, `IdeoMatrix`, enum `TIPO_IDEO`
- `packages/shared-types/src/index.ts` — re-exports

### Documentação

- `docs/integracoes/escala-xlsx-formatos.md` — referência para S3b
- `docs/sprint-logs/s3a.md` (este arquivo)

### Dependências adicionadas

- `exceljs` (apps/api) — para S3b ainda; já instalado durante a investigação

## Verificação end-to-end

```bash
# Login
curl -X POST http://localhost:3000/auth/login -H "Content-Type: application/json" \
  -d '{"nf":"3037509","senha":"<sua-senha>"}' -c /tmp/c.txt

# Fiscais — cadastrar override
curl -X POST http://localhost:3000/fiscais -b /tmp/c.txt \
  -H "Content-Type: application/json" \
  -d '{"militarNf":"3037509","equipe":"C","vigenciaInicio":"2026-04-01","vigenciaFim":"2026-04-30","motivo":"teste"}'

# Cadastrado vigente
curl "http://localhost:3000/fiscais/cadastrado-vigente?equipe=C&data=2026-04-15" -b /tmp/c.txt

# Vigente com cálculo default (menor ANT)
curl -X POST http://localhost:3000/fiscais/vigente -b /tmp/c.txt \
  -H "Content-Type: application/json" \
  -d '{"equipe":"C","data":"2026-05-01","escalados":[{"nf":"4750241","ant":1095},{"nf":"3037509","ant":418}]}'
# → {"fiscal":{"militarNf":"3037509","origem":"default"}}

# IDEO — upsert dia 23 ABTS
curl -X POST http://localhost:3000/ideo -b /tmp/c.txt \
  -H "Content-Type: application/json" \
  -d '{"dia":23,"tipo":"ABTS","itens":["Mochila Costal","GPS"]}'

curl "http://localhost:3000/ideo" -b /tmp/c.txt
```

Frontend: http://localhost:5173 → home tem 4 cards (Efetivo, Viaturas, Fiscais, IDEO). Telas
funcionais com auth/RBAC.

## Métricas

- **Arquivos modificados:** ~14 (api: 8 novos, frontend: 4, shared-types: 2, docs: 2)
- **Testes:** 49 (S2.5) → 64 (S3a) — +15
- **Linhas de código:** ~+1200
- **Pipeline:** lint ✅ format ✅ typecheck ✅ test (64 verdes) ✅ build ✅

## Próximo passo (S3b)

Parser XLSX completo + endpoints upload/preview/confirm/diff + tela `/cadastros/escalas`.
Estimativa: 4-5 dias úteis. ADR-004 emitido junto.

Após S3b, todos os pré-requisitos para **S4 (Prévia do Mapa Força)** estarão presentes:

- Efetivo + QDI ✓ (S2/S2.5)
- Viaturas ✓ (S2)
- Fiscais ✓ (S3a)
- IDEO ✓ (S3a)
- Escala mensal parseada ⏳ (S3b)

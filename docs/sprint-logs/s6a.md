# Sprint S6a — Refinamentos: Escala Especial + Efetivo refatorado + Viaturas

**Data:** 2026-05-09
**Foco:** Importação de Escala Especial XLSM, refator do Efetivo (3 fontes), Viaturas com nova nomenclatura/bloqueio MF/novos campos
**Tech Lead:** 2º SGT Heitor Barcellos Coelho

> S6b (workflow Servico/Conferências/escrita MF), S5b (persistência Prisma+Supabase) entram em sprints separados.

## Critérios de Pronto S6a (DoD)

- [x] **F1** Parser de Escala Especial XLSM (aba `Modelo Aviso - Especial`) + service mock + endpoints + tela `/cadastros/escalas-especiais` + WhatsApp helper
- [x] **F2** `QdiDadosService` lê aba DADOS (gid 1395786516) com filtro LOCAL="1ª1º"
- [x] **F2** `EfetivoService` 3-way merge: DADOS > 1ª1º > EFETIVO
- [x] **F2** Tipo `Militar` estendido: lotacao, classe, conceitoDisciplinar, pontos, CNH, incorporação, mergulho, FTBA, ETSP, CCVE, censo, planoFerias, origensFonte
- [x] **F2** Página `/cadastros/efetivo/:nf` com cards de Identificação/Lotação/Funcional/Habilitação/Pessoal + badge de origem
- [x] **F3** Nomenclatura de status MF: DISPONIVEL/BAIXADA/EMPRESTADA (sem operacional/reserva/em_manutencao)
- [x] **F3** Flag `viatura.origem`: 'mapa_forca' vs 'override_admin'
- [x] **F3** Bloqueio de edição (status/prefixo) em viaturas do MF; campos auxiliares editáveis
- [x] **F3** Novos campos: kmAtual, tipoCombustivel, usaArla32, capacidadeTanqueLitros, alturaMetros, larguraMetros, militarResponsavelNf
- [x] **F3** UI com lookup militar (combobox debounced 300ms)
- [x] ADR-008 (3 fontes Efetivo) + ADR-009 (Viaturas MF + origem)
- [x] Tests: 161 verdes (151 backend + 10 web; era 137; +24)
- [x] Pipeline: lint+format+typecheck+test+build verdes

## Entregas

### Backend (apps/api)

**F1 — Escala Especial:**

- `apps/api/src/modules/escalas-especiais/escala-especial-xlsm-parser.ts` — parser puro Buffer→`EscalaEspecialMensal`
- `apps/api/src/modules/escalas-especiais/escala-especial-xlsm-parser.test.ts` — 6 testes (fixture real)
- `apps/api/src/modules/escalas-especiais/escalas-especiais.service.ts` — mock CRUD + `getAtosDoDia`
- `apps/api/src/modules/escalas-especiais/escalas-especiais.service.test.ts` — 5 testes
- `apps/api/src/modules/escalas-especiais/escalas-especiais.controller.ts` — preview/confirm/list/delete (multipart)
- `apps/api/src/modules/escalas-especiais/escalas-especiais.module.ts`
- `apps/api/src/modules/escalas-especiais/__fixtures__/05 - ESCALA ESPECIAL 1ª CIA - MAIO.xlsm`
- `apps/api/src/app.module.ts` — registra `EscalasEspeciaisModule`

**F2 — Efetivo refatorado:**

- `apps/api/src/modules/efetivo/qdi-dados-csv-parser.ts` — parser aba DADOS com filtro LOCAL
- `apps/api/src/modules/efetivo/qdi-dados-csv-parser.test.ts` — 7 testes
- `apps/api/src/modules/efetivo/qdi-dados.service.ts` — espelho do QdiService para gid 1395786516
- `apps/api/src/modules/efetivo/__fixtures__/qdi-dados-2026-05-09.csv` (1458 linhas)
- `apps/api/src/modules/efetivo/__fixtures__/qdi-1cia-2026-05-09.csv` (151 linhas)
- `apps/api/src/modules/efetivo/efetivo.service.ts` — `mergeThreeSources` (DADOS > 1ª1º > EFETIVO)
- `apps/api/src/modules/efetivo/efetivo.module.ts` — registra `QdiDadosService`

**F3 — Viaturas:**

- `apps/api/src/modules/viaturas/viaturas.service.ts` — refator: nomenclatura MF, flag origem, bloqueio
- `apps/api/src/modules/viaturas/viaturas.service.test.ts` — 12 testes (reescrito)
- `apps/api/src/modules/viaturas/mock-viaturas.ts` — **deletado** (não usado desde S5)

### Frontend (apps/web)

**F1:**

- `apps/web/src/lib/whatsapp-especial.ts` — `formatEscalaEspecialParaWhatsapp`
- `apps/web/src/lib/whatsapp-especial.test.ts` — 4 testes
- `apps/web/src/pages/escalas-especiais.tsx` — upload + preview + lista + WhatsApp

**F2:**

- `apps/web/src/pages/efetivo-detalhe.tsx` — página `/cadastros/efetivo/:nf`
- `apps/web/src/pages/efetivo.tsx` — card vira `Link` clicável

**F3:**

- `apps/web/src/pages/viaturas.tsx` — reescrito: novos campos, lookup militar, banner MF, bloqueio

**Comum:**

- `apps/web/src/lib/api.ts` — `escalasEspeciais*` (4 métodos)
- `apps/web/src/router.tsx` — rotas `/cadastros/efetivo/:nf` + `/cadastros/escalas-especiais`
- `apps/web/src/pages/home.tsx` — card "Escala Especial (XLSM)" no grid

### Shared types

- `packages/shared-types/src/escala-especial.ts` — `EscalaEspecialAto`, `EscalaEspecialMensal`, `PreviewEscalaEspecialResponse`
- `packages/shared-types/src/militar.ts` — campos novos (lotacao, classe, conceito, pontos, CNH, etc.)
- `packages/shared-types/src/viatura.ts` — `STATUS_VIATURA` renomeado, `ORIGEM_VIATURA`, `TIPOS_COMBUSTIVEL`, novos campos
- `packages/shared-types/src/index.ts` — re-export

### Documentação

- `docs/adr/ADR-008-tres-fontes-efetivo.md`
- `docs/adr/ADR-009-viaturas-nomenclatura-mf-e-origem.md`
- `docs/sprint-logs/s6a.md` (este arquivo)

### Scripts auxiliares (não versionados como permanentes)

- `scripts/inspect-escala-especial.mjs`, `scripts/dbg-escala.mjs`, `scripts/dbg-parser.mjs` — debug temporário (manter ou apagar)

## Verificação end-to-end

```bash
# 1. Aba DADOS acessível
curl -sL "https://docs.google.com/spreadsheets/d/12-XCsNwr34d625Wkkuq-mr4bmv2Fcr2QQ1C7WfVjwB0/export?format=csv&gid=1395786516" | head -3

# 2. Login
curl -X POST http://localhost:3000/auth/login -H "Content-Type: application/json" \
  -d '{"nf":"3037509","senha":"<sua-senha>"}' -c /tmp/c.txt

# 3. Efetivo refatorado: BARCELLOS com lotacao + CNH
curl "http://localhost:3000/efetivo/3037509" -b /tmp/c.txt | jq '{nf, posto, nomeGuerra, lotacao, classe, cnh, incorporacao, origensFonte}'
# Esperado: lotacao=1ª1º, classe definida, origensFonte inclui DADOS

# 4. Viaturas com nomenclatura MF
curl http://localhost:3000/viaturas -b /tmp/c.txt | jq '.[] | {prefixo, status, origem}'
# Esperado: status DISPONIVEL/BAIXADA/EMPRESTADA, origem mapa_forca/override_admin

# 5. Bloqueio: tentativa de mudar status de viatura MF
curl -X PUT http://localhost:3000/viaturas/mf:ABTS_011 -b /tmp/c.txt \
  -H 'Content-Type: application/json' -d '{"status":"BAIXADA"}'
# Esperado: 400 com "Conferência da Viatura"

# 6. Importar Escala Especial
curl -X POST http://localhost:3000/escalas-especiais/preview -b /tmp/c.txt \
  -F "file=@data/Escala Especial Tabela de Lançamento/05 - ESCALA ESPECIAL 1ª CIA - MAIO.xlsm" | jq '{atos: .escala.atos | length, descartados}'

# 7. Smoke test
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm build
```

Frontend (http://localhost:5173):

- `/cadastros/efetivo` → clicar em qualquer militar → vai para `/cadastros/efetivo/:nf` com cards completos
- `/cadastros/viaturas` → ABTS_011 (do MF) com badge "MF" amarelo + banner ⚠️ + campos travados
  ao editar; viatura criada manualmente fica editável; lookup de militar funciona
- `/cadastros/escalas-especiais` (nova rota, card no home) → upload do XLSM real → preview com
  atos agrupados por data → confirmar → botão "📋 Copiar Aviso WhatsApp" funciona

## Achados durante a implementação

- **Aba `Modelo Aviso - Especial` tem 2 tabelas paralelas** (mês corrente cols 14-17 + período
  anterior cols 21-25). Parser pega só a primeira (header detection com `if (m < 0)` para fixar
  a primeira ocorrência).
- **`ws.actualColumnCount` reporta 34** — header completo até col 25, mas a primeira tabela
  útil termina em col 17.
- **Coluna LOCAL da aba DADOS** aceita "1ª1º" e "1ª/1º" — ambas vão para o filtro padrão.
- **Datas na aba Modelo Aviso vêm como `Date` JS**, não strings — `cellToIsoDate` cobre Date/string
  ISO/dd/mm/yyyy.
- **`viaturaSchema.id` precisou aceitar `string` genérico** (não `string().uuid()`) porque
  viaturas do MF têm id `mf:ABTS_011`.
- **`createViaturaSchema` exclui `origem` e `estadoTanquePercent`** — origem é setada pelo
  service, estado do tanque vem só da Conferência (S6b).
- **Mock antigo `mock-viaturas.ts` removido** (não era importado por ninguém desde S5/F2).

## Métricas

- **Arquivos modificados:** ~15 novos + 8 modificados (api: 9 novos, web: 3 novos + 4 modificados,
  shared-types: 1 novo + 3 modificados, docs: 3 novos)
- **Testes:** 137 (S5) → **161** (S6a) — +24 (6 escala especial parser + 5 escala especial
  service + 4 whatsapp especial + 7 qdi dados + 12 viaturas reescritos - 10 viaturas antigos)
- **Linhas de código:** ~+2500 (página /efetivo/:nf grande, viaturas.tsx reescrita,
  escalas-especiais.tsx nova)
- **Pipeline:** lint ✅ format ✅ typecheck ✅ test (161 verdes) ✅ build ✅

## Próximo passo (S6b — workflow operacional)

S6b traz o item 4 inteiro do pedido original:

- **Servico**: estado do dia (NAO_INICIADO / INICIADO / EQUIPE_CONFERIDA / VIATURA_CONFERIDA / PREENCHENDO_MF / ENCERRADO)
- **Conferência da Equipe** (Chefe de Equipe): marca presenças, registra substituições
- **Conferência da Viatura** (Motorista): muda status, preenche `estadoTanquePercent`,
  registra observações datadas
- **Read-only Prévia**: após `Servico.iniciar()`, `/previa` vira somente leitura
- **Refactor PreviaDoDia**: shape espelhando o Mapa Força para escrita futura (S9)
- **Mapeamento campo-a-campo Prévia↔MF** (ADR-010)
- **Trocas pré-serviço** → seção "Equipes" da PD; **trocas durante serviço** → "Alterações
  Diversas" com horário
- **Escala especial** → "Observações de serviço envolvendo a 1ª BBM" (consome
  `EscalasEspeciaisService.getAtosDoDia` que F1 já entregou)
- **Viatura baixada com motivo persistente** + alteração de viatura durante serviço

Estimativa S6b: 6-7 dias úteis.

S5b (Persistência Prisma+Supabase + deploy Vercel) continua planejado para entrar antes do
go-live de homologação.

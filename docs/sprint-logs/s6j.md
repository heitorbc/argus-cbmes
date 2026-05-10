# Sprint S6j — Dispensas refatoradas + lista canônica I–VIII + perfil militar

**Data:** 2026-05-10
**Foco:** Item 1.4 da rodada S6h–S6l. Entidade Dispensa canônica + módulo
Sargenteação + saldo no perfil militar + integração Prévia.
**Tech Lead:** 2º SGT Heitor Barcellos Coelho

> Terceiro sprint da rodada (S6h ✅ PR #8, S6i ✅ PR #9). Refator do
> `previaDispensaSchema` antigo (texto livre) para entidade `Dispensa` com
> 8 tipos canônicos, limites anuais e saldo por militar.

## Critérios de Pronto S6j (DoD)

- [x] **F1** `TIPO_DISPENSA` (8 valores I–VIII) +
      `LIMITE_DIAS_POR_TIPO` + `dispensaSchema` (entidade) +
      helpers `dispensaAtivaNoDia` e `calcularSaldoMilitar` em
      `@argus/shared-types/dispensa.ts`.
- [x] **F2** `DispensasService` (in-memory) com CRUD + `listAtivasNoDia` +
      `saldoMilitar` + guard `createOrConflict` para duplicata exata.
- [x] **F3** `DispensasController` REST: `GET /dispensas`,
      `GET /dispensas/saldo/:nf/:ano`, `GET /dispensas/:id`,
      `POST` (admin/sargenteante/fiscal),
      `PUT/DELETE :id` (admin/sargenteante).
- [x] **F4** `PreviaService` injeta `DispensasService` e popula
      `previa.dispensas` com `listAtivasNoDia(data)` enriquecido com nome
      do militar (substitui o `ajustes.dispensas` legado).
- [x] **F5** Página `/cadastros/dispensas` (Sargenteação) com CRUD admin +
      filtro por militar/ano. Card por dispensa com badge de tipo colorido.
- [x] **F6** Perfil do militar (`efetivo-detalhe.tsx`) ganha card "Dispensas
      gozadas no ano" com saldo por tipo, barras de progresso e
      destaque vermelho quando limite atingido.
- [x] **F7** Ajuste pré-turno da Prévia (`<DispensasFieldset>`): lista
      read-only das dispensas ativas + botão "+ Cadastrar dispensa" que
      cria via `api.dispensasCreate()` direto. Remove via
      `api.dispensasRemove(d.dispensaId)`.
- [x] **F8** Home: link "🏖️ Dispensas" na seção Sargenteação.
- [x] +10 cenários de teste novos (`DispensasService`).
      Backend 261 → **271 passing**.
- [x] Pipeline: typecheck + lint + format + build verdes.

## Lista canônica de tipos

| Código           | Descrição                 | Limite anual                |
| ---------------- | ------------------------- | --------------------------- |
| `I_TAF`          | I — TAF institucional     | 4 dias (operacional)        |
| `II_EXAME`       | II — Exame de saúde       | 2 dias (1/semestre)         |
| `III_INOVACAO`   | III — Inovação            | 2 dias                      |
| `IV_INSTRUCAO`   | IV — Instrução            | 2 dias                      |
| `V_ANIVERSARIO`  | V — Aniversário           | 1 dia                       |
| `VI_ASSIDUIDADE` | VI — Assiduidade          | 6 dias                      |
| `VII_MERITO`     | VII — Mérito disciplinar  | 2 dias                      |
| `VIII_DIVERSAS`  | VIII — Situações diversas | sem limite (ato específico) |

`VIII_DIVERSAS` usa sentinela `999` no enum de limites para indicar
"sem limite numérico — controle por ato publicado".

## Próximo passo

- **S6k:** Atestados (módulo + integrações Prévia + PD) — ~2d.
- **S6l:** Notas de Serviço CRUD manual + ajuste pré-turno — ~2d.
- **S6m (futuro):** Parser PDF de NS.
- **S5b:** Persistência Prisma+Supabase + deploy Vercel.

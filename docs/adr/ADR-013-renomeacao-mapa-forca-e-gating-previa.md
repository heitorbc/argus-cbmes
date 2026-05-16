# ADR-013 — Renomeação `previa` → `mapa-forca` + Gate de edição por Fiscal escalado

**Status:** ACEITO
**Data:** 2026-05-14
**Autores:** 2º SGT Heitor Barcellos Coelho (NF 3037509)
**Sprint:** S0.x (rename-mapa-forca)
**Branch:** `feat/rename-mapa-forca-calendario-gating`

## Contexto

A nomenclatura institucional confundia dois conceitos distintos:

1. **Mapa Força** — o documento/visão que apresenta todos os dados dos recursos em
   serviço de um dia (composição, viaturas, fiscal, IDEO, etc.). Documento operacional
   consolidado, consultado por toda a equipe.
2. **Prévia do Mapa Força** — o **ato** do Fiscal de Serviço escalado revisar e editar
   esses dados antes do início efetivo do serviço (na passagem entre equipes). A
   passagem ocorre a cada 24h porque o serviço é ininterrupto.

A versão anterior do sistema chamava o módulo principal de "Prévia do Mapa Força" e
permitia que qualquer usuário com papel `admin | fiscal | sargenteante` editasse os
ajustes pré-turno a qualquer momento — o que diluía a responsabilidade do Fiscal
escalado e violava a semântica institucional.

## Decisão

Três mudanças coordenadas:

### 1. Renomeação semântica

- Módulo `previa` → `mapa-forca` (backend, frontend, URL)
- Módulo `mapa-forca` (CIODES integration) → `mapa-forca-ciodes` (libera o nome
  principal para o módulo institucional)
- Tipos: `PreviaDoDia` → `MapaForcaDoDia`; `PreviaFiscal` → `FiscalDoDia`;
  `PreviaInconsistencia` → `MapaForcaInconsistencia`;
  `PreviaTripulacaoEntry` → `TripulacaoEntry`
- Método: `getPreviaDoDia` → `getMapaForcaDoDia`
- URL: `/previa` → `/mapa-forca` (com `/mapa-forca/:data` para detalhe). Redirect
  curto `/previa` → `/mapa-forca` para bookmarks antigos.

**Mantido** com nome `Previa*`: tipos que designam edições durante o **ato Prévia**
(ajustes pré-turno):

- `AjustesPrevia`, `AjustesPreviaService`
- `PreviaTroca`, `PreviaEscalaEspecial`, `PreviaNotaServico`, `PreviaDispensa`,
  `PreviaAtestado`, `PreviaFerias`, `PreviaSwapMilitar`

### 2. Novo estado `PREVIA_INICIADA`

```
NAO_INICIADO  →  PREVIA_INICIADA  →  INICIADO  →  EQUIPE_CONFERIDA  →  ...  →  ENCERRADO
                       ↓
                  (cancelar)
                       ↓
                NAO_INICIADO
```

Inserido entre `NAO_INICIADO` e `INICIADO` no `ESTADO_SERVICO`. Semântica:

- **NAO_INICIADO**: padrão. Mapa Força em **somente leitura**. Ninguém edita.
- **PREVIA_INICIADA**: Fiscal escalado (ou admin) clicou "Iniciar Prévia do Mapa Força".
  Edição liberada **apenas** para o iniciador.
- **INICIADO** (e demais): serviço em andamento, ajustes pré-turno congelados,
  Conferências habilitadas.

`servicoEstadoSchema` ganha:

- `previaIniciadaEm?: string`
- `previaIniciadaPorNf?: string`

Endpoints novos:

- `POST /servico/:data/iniciar-previa` — transição `NAO_INICIADO → PREVIA_INICIADA`,
  validando `user.nf === fiscalDoDia.militarNf || isAdmin`.
- `POST /servico/:data/cancelar-previa` — volta para `NAO_INICIADO` (apenas o
  iniciador ou admin).
- `GET /mapa-forca/:data/fiscal` — retorna apenas o Fiscal escalado, sem carregar o
  payload completo (consumido pelo frontend para o gate inicial).
- `GET /escalas/:ano/:mes/dias-disponiveis` — lista dias do mês com escala XLSX
  importada (consumido pelo calendário).

### 3. Calendário com lazy-loading

Tela `/mapa-forca` apresenta calendário (default) ou lista dos dias com escala XLSX
importada. Sem carregamento prévio do dia atual. Toques navegam para
`/mapa-forca/:data` em modo read-only — o usuário ativa edição explicitamente.

## Alternativas consideradas

### Naming (renomeação)

| Opção                                                 | Decisão                                                                                           |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Manter URL `/previa` e só mudar labels visuais        | ❌ Rejeitada — violaria o pedido explícito do Tech Lead de "mudar em todos os locais necessários" |
| Fundir CIODES dentro do novo `mapa-forca`             | ❌ Rejeitada — maior refactor; sub-resource adicionaria complexidade sem ganho operacional        |
| **Renomear CIODES → `mapa-forca-ciodes`** (escolhida) | ✅ Resolve a colisão de nomes preservando semântica clara                                         |

### Estado da Prévia

| Opção                                                 | Decisão                                                                             |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Flag boolean separada `previaIniciada`                | ❌ Duas dimensões de estado paralelas — propenso a bugs de inconsistência           |
| Renomear `INICIADO` → separar em 2 estados            | ❌ Refactor amplo demais nas conferências (S6b)                                     |
| **Novo estado `PREVIA_INICIADA` no enum** (escolhida) | ✅ Reuso máximo da máquina de estados existente; transições explícitas e auditáveis |

### Calendário

| Opção                              | Decisão                                                          |
| ---------------------------------- | ---------------------------------------------------------------- |
| Grid customizado puro Tailwind     | ⚠️ ~150 LOC de código novo a manter                              |
| Só lista (sem grid)                | ❌ Perde affordance visual do calendário                         |
| **`react-day-picker` (escolhida)** | ✅ Lib madura, ~30kb gz, suporta features futuras (range, multi) |

## Consequências

### Positivas

- Semântica institucional alinhada: "Mapa Força" é o documento; "Prévia do Mapa Força"
  é o ato de edição na passagem de serviço.
- Controle granular de edição: apenas o Fiscal escalado (ou admin) edita, evitando
  que outros usuários com papel `fiscal/sargenteante` modifiquem dados de equipes
  alheias.
- Ausência de carregamento prévio: usuário escolhe explicitamente o dia que quer
  consultar/editar. Reduz tráfego e ruído visual.
- Auditabilidade: `previaIniciadaEm` e `previaIniciadaPorNf` registram quem abriu
  a edição — útil para investigar conflitos posteriores.

### Negativas

- 24 testes de backend exigiram ajuste para passar pelo novo estado intermediário
  (`iniciarPrevia` antes de `iniciar`).
- Muitos arquivos tocados (~30 arquivos), aumentando o blast radius do PR.
- Histórico git mostra renomes em massa — tipo de commit que requer revisão extra.
- Sprint logs antigos mantém o termo `previa` (preservados como histórico imutável).

### Compatibilidade

- Bookmarks antigos `/previa` redirecionam para `/mapa-forca` (router-level).
- Schema field `iniciadoEm` (estado INICIADO) preservado — apenas adicionados campos
  novos.
- Backend mock in-memory: dados resetam a cada deploy, então não há migração
  necessária. Em S5b (Supabase), migrations cobrirão o novo estado.

## Notas para implementadores futuros

- Quando S9 (escrita real do Mapa Força via OAuth) for implementado, o fluxo de
  trabalho ficará: `Iniciar Prévia → ajustes → Iniciar Serviço → Conferências →
Preencher Mapa Força → Encerrar`. A separação `iniciar-previa` vs `iniciar`
  facilita auditar quem revisou os dados antes da escrita transacional.
- Se em S5b (Supabase) for necessário suportar múltiplos Fiscais editando a Prévia
  simultaneamente, considerar:
  - Lock pessimista (apenas 1 editor por vez) — abordagem atual
  - CRDT-style merge (mais complexo mas permite colaboração)
- O endpoint `GET /mapa-forca/:data/fiscal` hoje carrega o payload completo
  internamente (otimização não-essencial para mock). Em S5b deve ser substituído
  por consulta direcionada ao banco para reduzir latência do gate.

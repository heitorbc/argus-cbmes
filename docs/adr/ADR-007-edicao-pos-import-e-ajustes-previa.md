# ADR-007 — Edição da escala pós-import e Ajustes pré-turno na Prévia

**Status:** Aceito
**Data:** 2026-05-09
**Sprint:** S5
**Decisor:** 2º SGT Heitor Barcellos Coelho — Tech Lead

## Contexto

Após o S3b (parser XLSX), a escala importada virava **read-only** — qualquer
ajuste exigia gerar um novo XLSX e re-importar. Na prática operacional o
Fiscal do Dia precisa fazer ajustes pontuais antes do turno:

- Trocar a equipe de um dia (Sargenteante anunciou alteração via WhatsApp,
  ainda não saiu novo XLSX)
- Substituir um militar de uma posição (acidente, dispensa de última hora)
- Registrar Trocas formais com período (24h, matutino/vespertino)
- Anotar Escala Especial (Matutina/Vespertina) que vem de fora do XLSX
- Listar NS aplicáveis ao dia (NS072, NS074...)
- Listar Dispensas

A questão: **persistir esses ajustes onde, e com que UI?**

Opções consideradas:

A. **Editar o `EscalaMensal` original** (in-memory mutável) e tudo flui pela
Prévia naturalmente.
B. **Criar uma entidade separada `AjustesPrevia` por data** com os campos
estruturados (trocas, escala especial, NS, dispensas) sem mexer no
`EscalaMensal`.
C. **Drag-and-drop completo** com reorganização livre de militares entre
posições.

## Decisão

**Combinação A + B; C deferido para S6.**

### A) Edição direta da escala (`EscalasService` mutável)

- Endpoints `PUT /escalas/:ano/:mes/dia-equipe` e `PUT /escalas/:ano/:mes/composicao`
  permitem alterar dia→equipe e posições da composição.
- UI: modo "Editar escala" no detalhe expandido em `/cadastros/escalas`.
  Calendário vira `<select>`, células de militar viram `<input>` com onBlur
  que dispara o PUT.
- RBAC: `admin` e `sargenteante`. Fiscal não edita a escala diretamente
  (deve usar a seção Ajustes na Prévia).

### B) Ajustes pré-turno na Prévia (`AjustesPreviaService` por data)

- Modelo: `AjustesPrevia = { trocas, escalaEspecial, notasServico, dispensas }`
- Endpoints `GET /previa/:data/ajustes` e `PUT /previa/:data/ajustes`
  (overwrite atômico do objeto inteiro).
- `PreviaDoDia` retornado pelo `/previa?data=` agora inclui esses 4 campos
  no body (merge implícito feito pelo `PreviaService`).
- UI: `<details>` "Ajustes pré-turno" expansível na tela `/previa` com 4
  sub-formulários (trocas, escala especial, NS, dispensas) + botão "Salvar".
- RBAC: `admin`, `fiscal`, `sargenteante`.

### C) Drag-and-drop deferido para S6

A intenção do Tech Lead era DnD para reorganização livre de militares entre
posições. Avaliação: o ganho funcional sobre a edição inline (B) é apenas de
ergonomia. Em mobile, DnD com touch é frágil; em desktop, dropdowns e click
funcionam bem. A complexidade incluída (`@dnd-kit/*` + sensors touch +
acessibilidade keyboard) é alta e não cabe sem comprometer o DoD do S5.

S6 (Conferência da Equipe) já vai mexer profundamente na composição — DnD
naturalmente entra como parte daquele sprint.

## Como `PreviaService` integra

Após gerar a tripulação a partir de Escala+MapaForça, o service consulta
`AjustesPreviaService.get(dataIso)` e adiciona os 4 campos ao `PreviaDoDia`
retornado. As trocas **não** modificam a tripulação automaticamente — o
Fiscal vê tanto a tripulação original quanto a lista de trocas e decide
manualmente como informar no Mapa Força. (Auto-aplicar trocas vira S6.)

## Tests

- `apps/api/src/modules/escalas/escalas.service.test.ts` — 6 cenários novos
  (`updateDiaEquipe`, `upsertComposicao`).
- `apps/api/src/modules/ideo/ideo-checklist.service.test.ts` — 5 cenários.
- `apps/api/src/modules/previa/previa.service.test.ts` — atualizado para
  injetar `AjustesPreviaService` no construtor.
- `apps/web/src/lib/whatsapp.test.ts` — 4 cenários cobrindo header, status
  inline `***#BAIXADA#***`, equipe vazia e seções vazias com placeholder.

## Não decidido aqui

- Como a Conferência (S6) consumirá os ajustes para auto-aplicar trocas
  na tripulação visível.
- Se "Notas de Serviço" devem ter lookup contra arquivos `data/Nota de Serviço/`
  (hoje é texto livre `codigo` + `descricao`).
- Versionamento/auditoria das alterações na escala (Fase 2).

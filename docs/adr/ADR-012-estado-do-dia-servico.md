# ADR-012 — Estado do dia (Servico) + RBAC granular do workflow

**Status:** Aceito
**Data:** 2026-05-09
**Sprint:** S6b
**Decisor:** 2º SGT Heitor Barcellos Coelho — Tech Lead

## Contexto

Até S6a-fix, a Prévia do Mapa Força era um documento estático — qualquer
usuário com papel adequado podia editar ajustes pré-turno a qualquer momento.
Isso funcionava antes do início do serviço, mas:

1. Não há checkpoint claro de "agora começou o serviço — Prévia não muda mais".
2. Conferências (Equipe + Viatura) precisam de um momento institucional
   definido para ocorrer.
3. Trocas durante o serviço precisam ir para uma seção diferente da PD
   ("Alterações Diversas" com timestamp), não para "Ajustes pré-turno".

## Decisão

### 1. Estados do Servico do dia

```typescript
export const ESTADO_SERVICO = [
  'NAO_INICIADO',
  'INICIADO',
  'EQUIPE_CONFERIDA',
  'VIATURA_CONFERIDA',
  'PREENCHENDO_MF', // reservado para S9
  'ENCERRADO',
] as const;
```

### 2. Transições válidas

```
NAO_INICIADO ─▶ INICIADO            (Fiscal: POST /servico/:data/iniciar)
INICIADO ────▶ EQUIPE_CONFERIDA     (auto: todas presenças marcadas)
EQUIPE_CONFERIDA ─▶ VIATURA_CONFERIDA  (auto: todas viaturas conferidas)
VIATURA_CONFERIDA ─▶ ENCERRADO      (Fiscal: POST /servico/:data/encerrar)
qualquer estado ─▶ ENCERRADO        (admin/sargenteante: POST .../encerrar?force=true)
```

Transições internas (auto) acontecem quando:

- `ConferenciaEquipeService.bulkUpdate()` detecta que **todas** as marcações
  da data estão != 'pendente'
- `ConferenciaViaturaService.registrar()` é chamado e o estado da equipe já
  está conferido

### 3. RBAC granular

| Ação                                 | Papéis permitidos                                 | Por quê?                                        |
| ------------------------------------ | ------------------------------------------------- | ----------------------------------------------- |
| Ler estado                           | qualquer autenticado                              | Visibilidade pública dentro do BBM              |
| Iniciar serviço                      | `fiscal`, `admin`, `sargenteante`                 | Fiscal é responsável pelo dia                   |
| Encerrar serviço                     | `fiscal`, `admin`, `sargenteante`                 | Mesma autoridade que iniciou                    |
| Encerrar com `force=true`            | `admin`, `sargenteante` apenas                    | Override de exceção                             |
| Conferir equipe                      | `chefe_equipe`, `fiscal`, `admin`, `sargenteante` | Chefe da Equipe é o operador natural            |
| Conferir viatura                     | `motorista`, `fiscal`, `admin`, `sargenteante`    | Motorista da viatura confere                    |
| Registrar alteração diversa          | `fiscal`, `admin`, `sargenteante`                 | Decisão operacional fica com o Fiscal           |
| Editar Ajustes pré-turno (read-only) | `admin` apenas (override)                         | Ajustes são pré-serviço; após início, bloqueado |

### 4. Read-only enforcement no backend

`AjustesPreviaService` recebe `ServicoService` injetado. Em `upsert()`,
`addTrocaEscalaEspecial()`, `removeTrocaEscalaEspecial()`:

```typescript
private ensureEditable(dataIso: string, isAdmin: boolean): void {
  if (isAdmin) return;
  if (this.servico.isReadOnly(dataIso)) {
    throw new ForbiddenException(
      `Edição da Prévia de ${dataIso} bloqueada — serviço já iniciado.`,
    );
  }
}
```

Frontend obedece e desabilita botões via UX, mas o **enforcement é no
backend** — clientes não-UI também respeitam.

### 5. Estado persistido em PreviaDoDia

A Prévia retorna `estadoServico`, `iniciadoEm`, `iniciadoPorNf`,
`encerradoEm`, `encerradoPorNf` para que a UI saiba se está em modo
read-only sem chamada extra.

### 6. Mock in-memory por agora

`Map<dataIso, ServicoEstado>` em memória. Em S5b migra para Prisma
(tabela `servico_estado`). Mock é suficiente porque:

- 1 estado por dia é granularidade pequena
- Reset acontece só em desenvolvimento
- Race condition (2 fiscais iniciando ao mesmo tempo) tem `last-write-wins`
  semântico — segundo iniciar() rejeita com `BadRequest`

## Alternativas consideradas

- **Estado único `iniciado: boolean` + flags:** rejeitado — não captura a
  semântica do workflow institucional (Conferências em sequência).
- **Não bloquear edição da Prévia:** rejeitado — o documento "Prévia"
  precisa virar imutável para a Parte Diária ter rastro confiável.
- **Permitir admin pular tudo via UI:** rejeitado — força explícita via
  query `?force=true` deixa intenção clara no log/audit.
- **RBAC simples (qualquer autenticado faz tudo):** rejeitado pelo Tech
  Lead — papéis institucionais devem refletir hierarquia real.

## Consequências

**Positivas:**

- Fluxo do dia tem checkpoint claro: ajustes → iniciar → conferências →
  encerrar.
- Parte Diária (S10/S11) consome `composicaoMf + Conferência + Alterações
Diversas` com confiança que estava "congelado".
- Backend é fonte de verdade — mesmo se frontend bug, edição não passa.

**Negativas:**

- Mais um service para Prisma migrar em S5b.
- UI tem 2 modos (editável vs read-only) — exige cuidado no design para não
  confundir.
- `ConferenciaEquipeService` precisa de injeção do `ServicoService` (DI
  cyclic seria possível se `ServicoService` precisasse ler conferências —
  evitar).

## Tests

- `apps/api/src/modules/servico/servico.service.test.ts` — 16 cenários
  cobrindo todas as transições + 3 cenários de Alterações Diversas.
- `apps/api/src/modules/previa/ajustes-previa.service.test.ts` — 4
  cenários novos cobrindo o bloqueio read-only.
- `apps/api/src/modules/conferencia-equipe/conferencia-equipe.service.test.ts`
  — 8 cenários cobrindo bulkUpdate, marcação granular, transição automática.
- `apps/api/src/modules/conferencia-viatura/conferencia-viatura.service.test.ts`
  — 5 cenários incluindo geração automática de Alteração Diversa.

## Próximas iterações

- **S5b:** Persistência em Prisma (`servico_estado`, `conferencia_equipe`,
  `conferencia_viatura`, `alteracoes_diversas`).
- **S9:** Estado `PREENCHENDO_MF` é usado quando a escrita Puppeteer começa.
- **S10/S11:** PD lê `alteracoesDiversas` e renderiza seção própria.

## Referências

- [ADR-011 — composicaoMf espelhando MF](./ADR-011-mapeamento-previa-mf.md)
- [ADR-009 — Viaturas MF + bloqueio](./ADR-009-viaturas-nomenclatura-mf-e-origem.md)

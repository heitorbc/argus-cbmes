# ADR-009 — Viaturas: nomenclatura igual ao MF + flag origem + bloqueio

**Status:** Aceito
**Data:** 2026-05-09
**Sprint:** S6a
**Decisor:** 2º SGT Heitor Barcellos Coelho — Tech Lead

## Contexto

Após o S5 o `ViaturasService` consome o Mapa Força (col C: `VTR - DISPONIVEL`/`BAIXADA`/`EMPRESTADA`)
mas mapeia para uma nomenclatura interna diferente:

- `DISPONIVEL` → `'operacional'`
- `BAIXADA` → `'baixada'`
- `EMPRESTADA` → `'reserva'`
- (faltava `'em_manutencao'` que ninguém usava)

Problemas observados:

1. **Status na Prévia/UI ≠ MF:** o usuário vê "Operacional" no ARGUS mas
   "DISPONÍVEL" no MF — confusão visual.
2. **Sem proteção contra edição manual de viaturas do MF:** admin podia
   mudar status via PUT, gerando estado divergente até próximo refresh do MF.
3. **Sem campos operacionais ricos:** KM, combustível, ARLA32, dimensões,
   militar responsável — necessários para o ciclo de Conferência da Viatura
   (S6b) e geração da Parte Diária (S10/S11).

## Decisão

### 1. Nomenclatura interna espelha o MF

```typescript
// Antes (S5)
export const STATUS_VIATURA = ['operacional', 'em_manutencao', 'baixada', 'reserva'] as const;

// Depois (S6a/ADR-009)
export const STATUS_VIATURA = ['DISPONIVEL', 'BAIXADA', 'EMPRESTADA'] as const;
```

`STATUS_VIATURA_LABEL`:

- `DISPONIVEL` → "Disponível"
- `BAIXADA` → "Baixada"
- `EMPRESTADA` → "Emprestada"

### 2. Flag `origem` discrimina MF vs override admin

```typescript
export const ORIGEM_VIATURA = ['mapa_forca', 'override_admin'] as const;
```

`ViaturasService.list()` marca todas as viaturas vindas do MF com
`origem: 'mapa_forca'`; criadas via API (`POST /viaturas`) com
`'override_admin'`.

### 3. Bloqueio de edição para viaturas do MF

`ViaturasService.update()`:

- Se `current.origem === 'mapa_forca'`:
  - Mudança de `status` lança `BadRequestException` com mensagem clara:
    > "Status de viatura gerenciada pelo Mapa Força só pode ser alterado via Conferência da Viatura (S6b)."
  - Mudança de `prefixo` lança erro similar.
  - Demais campos (KM, combustível, militar responsável, etc.) podem ser
    editados — esses não vêm do MF.

`softDelete()` bloqueado completamente para `origem === 'mapa_forca'`.

UI: banner amarelo ⚠️ no formulário de edição quando viatura é do MF;
campos `prefixo`, `tipo` e `status` ficam `disabled`.

### 4. Campos novos de operação

Adicionados a `viaturaSchema`:

```typescript
kmAtual?: number;
tipoCombustivel?: 'diesel' | 'gasolina' | 'eletrico' | 'flex';
usaArla32?: boolean;
capacidadeTanqueLitros?: number;
estadoTanquePercent?: number;  // 0-100, READ-ONLY (vem da Conferência S6b)
alturaMetros?: number;
larguraMetros?: number;
militarResponsavelNf?: string;  // ref ao Militar.nf
```

`createViaturaSchema` exclui `estadoTanquePercent` (não é input — só vem da
Conferência) e `origem` (sempre `'override_admin'` para criados via API).

UI: lookup de militar via combobox com debounce 300ms, consumindo
`api.efetivoList({ q, somente1aCia: true })` (que já existe).

### 5. Mock antigo removido

`apps/api/src/modules/viaturas/mock-viaturas.ts` (`buildInitialViaturas`)
foi deletado — desde S5 o MF é a fonte de verdade. O arquivo só estava
referenciado por si mesmo no tsbuildinfo.

## Alternativas consideradas

- **Manter nomenclatura interna em minúsculas e converter no boundary:**
  rejeitada — duplica labels em 2 lugares (UI + escrita do MF), aumenta
  acoplamento.
- **Bloqueio só na UI sem validação backend:** rejeitada — admin com curl
  poderia burlar.
- **Tornar todos os campos novos obrigatórios:** rejeitada por
  retrocompatibilidade; viaturas do MF nascem sem esses dados, override
  preenche aos poucos.

## Consequências

**Positivas:**

- WhatsApp generator (já existe em `whatsapp.ts`) agora pode usar
  `v.status` direto sem mapear (`***#${status.toUpperCase()}#***` simplifica).
- Conferência da Viatura (S6b) tem schema pronto para receber dados do
  motorista — basta endpoint dedicado que muda status + estadoTanque +
  observações.
- Admin pode adicionar viaturas extras (override) que não estão no MF, sem
  conflito.

**Negativas:**

- Quebra de API: clientes esperando `status: 'operacional'` precisam
  atualizar para `'DISPONIVEL'`. Mitigação: lint + typecheck pegam todos os
  pontos.
- WhatsApp `formatPreviaParaWhatsapp` (S5) foi atualizado pelo refator de
  status mas precisa ser revalidado nos snapshot tests.
- `viaturaSchema.id` deixou de ser UUID estrito (`z.string()` em vez de
  `z.string().uuid()`) porque viaturas do MF têm id `mf:ABTS_011`.

## Tests

`apps/api/src/modules/viaturas/viaturas.service.test.ts` — 12 cenários
incluindo:

- Mapeamento DISPONIVEL/BAIXADA/EMPRESTADA da MF
- `origem` correto para MF e override
- Bloqueio de status/prefixo em viatura do MF (`BadRequestException`)
- Edição de campos auxiliares permitida em viatura do MF
- Bloqueio de softDelete em viatura do MF
- softDelete OK em override_admin

## Próximas iterações

- **S6b:** Endpoint `POST /viaturas/:id/conferencia` muda status +
  preenche `estadoTanquePercent` + adiciona observação datada.
- **S10:** Parte Diária consome `kmAtual`, `militarResponsavelNf`, etc.
  para a seção de viaturas.
- **S5b:** Migra para Prisma; FKs reais para `Militar.nf`.

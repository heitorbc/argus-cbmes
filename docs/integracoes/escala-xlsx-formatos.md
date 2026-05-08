# Estrutura dos XLSX de Escala Mensal — Investigação S3

**Data:** 2026-05-08
**Output da auditoria de:** `data/Escala de Serviço/*.xlsx` (10 arquivos)
**Propósito:** referência para o parser XLSX a ser implementado em S3b

## Inventário de arquivos auditados

| Arquivo                                            | Tipo              | Comentário                                                        |
| -------------------------------------------------- | ----------------- | ----------------------------------------------------------------- |
| `01 JANEIRO DE 2026.xlsx`                          | Padrão            | Aba `01 A 14 JAN`, `15 A 29 JAN` + 5 abas auxiliares              |
| `02 FEVEREIRO DE 2026.xlsx`                        | Padrão            | Aba `01 A 14 FEV`, `15 A 29 FEV`                                  |
| `02 FEVEREIRO DE 2026 - apos mergulho voltar.xlsx` | Variante          | Reupload mid-month (mergulho retornou)                            |
| `03 MARÇO DE 2026.xlsx`                            | Padrão            | Aba `01 A 14 MAR`, `15 A 29 MAR`                                  |
| `04 ABRIL DE 2026.xlsx`                            | Padrão            | Aba `01 A 14 ABR`, `15 A 29 ABR`                                  |
| `05 MAIO DE 2026.xlsx`                             | Padrão (PRIMÁRIO) | Aba `01 A 14 MAI`, `15 A 29 MAI` — usado como referência canônica |
| `05 MAIO DE 2026 11 A 15.xlsx`                     | Variante          | Reupload parcial (apenas dias 11-15)                              |
| `06 JUNHO DE 2026.xlsx`                            | Padrão            | Aba `01 A 14 JUN`, `15 A 29 JUN`                                  |
| `dia da mulher.xlsx`                               | Especial          | Não-mensal — possivelmente evento específico                      |
| `PROVA CHS.xlsx`                                   | Não-escala        | Arquivo CHS (formação) — REJEITAR no upload                       |

**Heurística para identificação:** se nome do arquivo contém `MES DE 2026` (formato `MM MES DE AAAA.xlsx`) → escala mensal padrão. Senão (ex.: PROVA, dia da mulher) → rejeitar com mensagem clara.

## Estrutura comum (todos os meses padrão)

Cada XLSX tem **8-9 abas**:

| Aba                      | Conteúdo                                            | Parser usa?        |
| ------------------------ | --------------------------------------------------- | ------------------ |
| `01 A 06 ABRIL`          | Aba legacy — sempre presente, ignorar               | NÃO                |
| `01 A 14 [MES]`          | **Escala dia 1-14**                                 | **SIM**            |
| `15 A 29 [MES]`          | **Escala dia 15-29/30/31**                          | **SIM**            |
| `Férias entrada e saída` | Tabela de férias                                    | Talvez (futuro)    |
| `DOC 01 A 14`            | Documento descritivo                                | NÃO                |
| `0`                      | Sucata (13 linhas)                                  | NÃO                |
| `EFETIVO`                | Lista local do efetivo (≠ planilha do Sargenteante) | NÃO (já temos QDI) |
| `Planilha2`              | Variável                                            | NÃO                |

**Parser deve:** carregar apenas as abas `01 A 14 [MES]` e `15 A 29 [MES]` (regex no nome da aba). MES = abreviação de 3 letras (JAN, FEV, MAR, ABR, MAI, JUN, JUL, AGO, SET, OUT, NOV, DEZ).

## Layout interno da aba `01 A 14 MAI` (canonical reference)

Dimensões: ~50 linhas × 45 colunas.

### Seção 1: Cabeçalho institucional (linhas 1-8)

Texto fixo: "GOVERNO DO ESTADO DO ESPÍRITO SANTO", "CORPO DE BOMBEIROS MILITAR", "1º BATALHÃO BOMBEIRO MILITAR", "1ª COMPANHIA", "ESCALA DE SERVIÇO", "1ª CIA / 1º BBM". **Parser: ignorar (validação opcional para confirmar que é o XLSX certo).**

### Seção 2: Mapa dia → equipe (linhas 9-13)

| Linha | Conteúdo                                                                     |
| ----- | ---------------------------------------------------------------------------- |
| 9-10  | "DIAS" (col 1) + datas em cols 2-15 (cada coluna = 1 dia consecutivo do mês) |
| 11    | (vazio)                                                                      |
| 12-13 | "EQUIPES" (col 1) + letra da equipe escalada (A/B/C/D) em cols 2-15          |

**Exemplo (maio 2026, cols 2-15 = dias 01/05 a 14/05):**

- Col 2 (01/05): Equipe `C` (Charlie)
- Col 3 (02/05): Equipe `D`
- Col 4 (03/05): Equipe `A`
- Col 5 (04/05): Equipe `B`
- ... (rotação 24×72 com 4 equipes)

**Parser: extrair `dataEquipe: Map<YYYY-MM-DD, "A"|"B"|"C"|"D">`.**

### Seção 3: Composição por viatura/função × equipe (linhas 15-31)

Header (linha 15):
| Cols 1-2 | Cols 3-6 | Cols 7-10 | Cols 11-14 | Cols 15-18 |
|---|---|---|---|---|
| FUNÇÕES | EQUIPE A | EQUIPE B | EQUIPE C | EQUIPE D |

**Cada equipe ocupa 4 colunas** — note: estas 4 colunas representam **a composição fixa daquela equipe** (não dias). Os 4 cols têm o **mesmo militar repetido** em cada linha (alguma redundância/preenchimento de layout). Pode haver substituições pontuais em algumas células (ex.: troca específica num dos dias do ciclo).

Linhas de dados (linhas 16-31):
| Col 1 | Col 2 | Conteúdo |
|---|---|---|
| (viatura) | (função) | militar nas 4 cols da equipe |
| AU 154 | ChOp | Chefe de Operações |
| AU 154 | Mot | Motorista do ChOp |
| ABTS 01 | Ch | Chefe ABTS |
| ABTS 01 | Mot | Motorista ABTS |
| ABTS 01 | Op 1 | Operador 1 |
| ABTS 01 | Op 2 | Operador 2 |
| ABTS 01 | Op 3 | Operador 3 (raro) |
| RESGATE | Ch | Chefe Resgate (AR) |
| RESGATE | Mot | Motorista Resgate |
| RESGATE | Soc | Socorrista |
| ATB | Ch/Mot | Cabo ATB (acumula chefe e motorista) |
| GUARDA | Sent. | Sentinela 1 |
| GUARDA | Sent. | Sentinela 2 |
| GUARDA | Sent. | Sentinela 3 |
| ALMOX. | (varia) | Almoxarife |

**Formato da célula militar:** `${posto-abreviado} ${nome-de-guerra-em-MAIÚSCULAS}` (ex.: `2º SGT JULIO`, `CB FABRE`, `SD MARTINELLI`). Cells vazias = sem militar nessa função/equipe.

**Parser: extrair `composicaoEquipe: Map<{equipe, viatura, funcao}, militar>`.**

### Seção 4: Férias e mudanças (linhas 33-37)

Tabela "FÉRIAS / INICIO" (col 7-13). Lista militares em férias durante o período.

**Parser: opcionalmente extrair lista de militares em férias com período.**

### Seção 5: Horários e observações (linhas 35-49)

- Linhas 35-39: tabela de horários por equipe (`07h10 às 07h10`, etc.) — informacional
- Linhas 43-49: "OBSERVAÇÕES" + "PREVISÃO DE MUDANÇA DE EQUIPE" + listas livres

**Parser: ignorar nesta primeira versão. Em S4 (Prévia), pode-se enriquecer com observações.**

## Variantes conhecidas

### Reupload mid-month (`02 FEVEREIRO ... apos mergulho voltar.xlsx`, `05 MAIO ... 11 A 15.xlsx`)

O Sargenteante reenvia o XLSX com mudanças (curso de mergulho terminou, dispensa cancelada, etc.). O parser precisa:

- **Detectar diff:** comparar a versão recebida com a vigente cadastrada
- **Aplicar parcialmente:** o reupload pode cobrir só uma janela (`11 A 15`) — preservar o resto
- **Confirmação obrigatória:** preview antes de aplicar (RF-CM-110)

### XLSX que NÃO são escala (`PROVA CHS.xlsx`, `dia da mulher.xlsx`)

Rejeitar no upload com mensagem: "Arquivo não está no formato esperado. O nome deve seguir `MM MES DE AAAA.xlsx` e conter abas `01 A 14 [MES]` e `15 A 29 [MES]`."

## Modelo de dados (pré-S5, mock in-memory)

```typescript
type LetraEquipe = 'A' | 'B' | 'C' | 'D';
type Funcao =
  | 'ChOp'
  | 'Mot ChOp'
  | 'Ch ABTS'
  | 'Mot ABTS'
  | 'Op1'
  | 'Op2'
  | 'Op3'
  | 'Ch AR'
  | 'Mot AR'
  | 'Soc'
  | 'Ch/Mot ATB'
  | 'Sent1'
  | 'Sent2'
  | 'Sent3'
  | 'Almox';

interface EscalaMensal {
  mes: number; // 1-12
  ano: number; // 2026
  origemArquivo: string; // nome do XLSX original
  importadoEm: string; // ISO timestamp
  importadoPorNf: string;
  /** Mapa dia → letra da equipe escalada (calendário operacional). */
  diaEquipe: Record<string, LetraEquipe>; // chave: "2026-05-01"
  /** Composição fixa por equipe. */
  composicao: Record<LetraEquipe, Composicao>;
}

interface Composicao {
  funcoes: Record<Funcao, MilitarRef | null>;
}

interface MilitarRef {
  nf?: string; // resolvido por matching nome de guerra → NF (do QDI)
  postoAbreviado: string;
  nomeGuerra: string;
  raw: string; // texto original da célula
}
```

## Estratégia de matching nome→NF

A célula traz `2º SGT JULIO`, mas precisamos do NF para integração com QDI/EFETIVO. Estratégia:

1. Normalizar o texto (remover acentos, uppercase, trim)
2. Cruzar com `QdiService.getByNf()` (já carregado em memória)
3. Match por `posto + nomeGuerra` exato → NF
4. Em caso de ambiguidade ou ausência: marcar `nf: undefined` e expor no preview para o Admin resolver manualmente

## Próximos passos (S3b)

1. Implementar `EscalaXlsxParser` em `apps/api/src/modules/escalas/escala-xlsx-parser.ts`
2. Tests com 3 fixtures: `04 ABRIL`, `05 MAIO`, `06 JUNHO`
3. Testar reupload diff (`05 MAIO 11 A 15.xlsx` aplicado sobre `05 MAIO`)
4. Endpoints `POST /escalas/preview`, `POST /escalas/confirm`, `GET /escalas?mes&ano`, `POST /escalas/diff`
5. Tela `/cadastros/escalas`
6. ADR-004

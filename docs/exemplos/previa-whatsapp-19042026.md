# Sample real — Prévia WhatsApp da CHARLIE 19/04/2026

Texto exato enviado pelo Fiscal no grupo de WhatsApp em 19/04/2026 (recebido do
Tech Lead em 2026-05-09). Serve como **oracle** para o `formatPreviaParaWhatsapp`
em `apps/web/src/lib/whatsapp.ts` e respectivos testes.

> ⚠️ Este sample contém nomes de militares reais conforme o uso operacional
> habitual no grupo. NFs e CPFs **não** aparecem aqui. Mantido para regressão
> de formato — se o formato precisar mudar, atualizar este arquivo + o teste.

```
*PRÉVIA MAPA FORÇA*
*EQUIPE CHARLIE*
19/04/2026

1. VIATURAS

🛻⭐ *Chefe de Operações - AU 154*
Ch: 1ºTEN QOA	BOREL
Mot: CB BERGI

🚒 *ABTS01 - ABTS 011*
Ch: 2º SGT  BARCELLOS
Mot: CB VICENTE
Op1: SD MARTINELLI
Op2: SGT BRUNO MELLO (Especial Matutina)
CB ELSOn (Especial Vespetina)

🚑 *RESGATE 01 - AR 044*
Ch: 3º SGT KARINA
Mot: CB FABRE
Soc:  CB  MELLINA

🚒 *ATB01*
Ch/Mot: CB DENIS
🪜  *AP01 - TE 110* ***#BAIXADA#***
Ch/Mot: CB DENIS

💂💂‍♀ *Guarda*
Sent1: CB ESMAEL
Sent2: SD LOUREIRO
Sent3: SD DANILO

🤿👨‍🚒 *Mergulho*
Ch: 3º SGT HUMBERTO
M1: CB BEATRIZ
M2: CB VINICIUS CORDEIRO

🚒🤿 *SALVAMAR VIX*
Ch: 2° SGT CHAGAS

2. TROCAS:
2.1
SUBSTITUÍDO: CB GUILHERME PERIM
SUBSTITUTO: CB FABRE
PERÍODO: 24h

3. ESCALA ESPECIAL:
Matutina: SGT BRUNO MELO
Vespertina: CB ELSON

4. NOTAS DE SERVIÇO
NS072 - PB RESGATE DIAS 23/04 E 24/04

5. DISPENSA:
2° SGT HOFFMAM

6. IDEO:
6.1 ABTS
Mochila Costal
GPS

6.2 RESGATE
Oxigênio
Aspirador
```

## Convenções inferidas

- Header: `*PRÉVIA MAPA FORÇA*` + `*EQUIPE [NOME]*` + `DD/MM/YYYY`
- Markdown WhatsApp: `*texto*` para negrito, `***texto***` para destaque
- Status inline: `***#BAIXADA#***`, `***#EMPRESTADA#***`
- Funções:
  - Padrão: `Ch`, `Mot`, `Op1` / `Op2` / `Op3`, `Soc`
  - Mergulho: `Ch`, `M1`, `M2`, `M3`
  - ATB consolidada: `Ch/Mot`
  - Guarda: `Sent1`, `Sent2`, `Sent3`
- Emoji por recurso (mapeamento em `whatsapp.ts → EMOJI_RECURSO`):
  - 🛻⭐ Chefe de Operações
  - 🚒 ABTS / ATB
  - 🚑 Resgate
  - 🪜 Plataforma (TE)
  - 💂 Guarda
  - 🤿👨‍🚒 Mergulho
  - 🚒🤿 Salvamar
- Substituições especiais (Matutino/Vespertino) podem aparecer como sub-linha
  da função principal — no ARGUS isso vai virar uma `troca` separada para ficar
  estruturado.

## Diferenças do que o ARGUS gera

- ARGUS sempre numera Sentinelas como `Sent. 1` / `Sent. 2` / `Sent. 3` (com
  ponto e espaço) para ser consistente com o output do parser XLSX.
- ARGUS sempre mostra a viatura como `[Recurso] - [Prefixo]` mesmo quando o
  Fiscal escreve só o recurso (ex.: "Mergulho" → "MERGULHO 02 - AM_002").
- Linhas em branco/espaços extras são removidos para melhor leitura no
  WhatsApp.

# [ARQUIVADO em S2.10.14c] Setup — Sheets-as-DB com Service Account

> **Status:** Arquivado em 2026-05-28 (S2.10.14c).
>
> Sheets-DB foi totalmente removido como integração runtime do ARGUS:
> Postgres é fonte canônica desde S2.10.5, dual-write encerrado em
> S2.10.9d, fallback bootstrap removido em S2.10.14a, módulo deletado
> em S2.10.14b, env vars removidas em S2.10.14c.
>
> Este documento permanece como registro histórico. Para integrações
> runtime atuais com planilhas Google, ver `docs/ARGUS_CBMES_PRD_v2.2.md`
> §2 (MapaForcaCiodes é a única que sobrevive — via CSV público sem auth).

**Sprint original:** S2.1
**Última atualização (antes do arquivamento):** 2026-05-15
**Tempo estimado:** 15–25 minutos (primeira vez no GCP)

## Por que isso

ARGUS CBMES Fase 1 não tem banco de dados real ainda (Supabase entra só em S2.9). Para evitar perda de dados ao restart e permitir múltiplas instâncias do backend, usamos uma **planilha Google como banco de dados intermediário**. Decisão do Tech Lead: Service Account EXCLUSIVA para essa planilha; demais integrações Google Sheets continuam por CSV público (read-only).

**Planilha-DB:** [`1-Z0Bn-WpNoUjPOfAp8ZeO0trlHbgiZEcMoqfPUqr-Xk`](https://docs.google.com/spreadsheets/d/1-Z0Bn-WpNoUjPOfAp8ZeO0trlHbgiZEcMoqfPUqr-Xk/edit)
**Abas (criadas automaticamente pelo bootstrap):** `bd_escala_mensal`, `bd_escala_especial`, `bd_notas_servico`

## Passo 1 — Criar projeto no Google Cloud Console

1. Acesse [console.cloud.google.com](https://console.cloud.google.com).
2. Selecionar o seletor de projeto (topo) → **Novo projeto**.
3. Nome: `argus-cbmes-sheets`
4. Organização: deixe como está (sem organização é OK).
5. Clique **Criar**.
6. Aguarde ~30s e selecione o projeto recém-criado no seletor.

## Passo 2 — Habilitar a Google Sheets API

1. No menu lateral: **APIs e serviços → Biblioteca**.
2. Pesquisar `Google Sheets API`.
3. Clique no resultado e em **Habilitar**.
4. Aguarde a ativação (~5s).

## Passo 3 — Criar Service Account

1. Menu lateral: **APIs e serviços → Credenciais**.
2. **+ Criar credenciais → Conta de serviço**.
3. **Nome da conta de serviço:** `argus-sheets-writer`
4. **ID da conta de serviço:** será preenchido automaticamente como `argus-sheets-writer`
5. **Descrição (opcional):** "Escreve em planilha-DB do ARGUS CBMES"
6. Clique **Criar e continuar**.
7. **Conceder acesso ao projeto** (papéis): pular (clique em **Continuar**).
8. **Conceder acesso aos usuários:** pular.
9. Clique **Concluído**.

## Passo 4 — Gerar chave JSON

1. Na lista de **Credenciais**, clique no email da SA (`argus-sheets-writer@<project>.iam.gserviceaccount.com`).
2. Aba **Chaves**.
3. **Adicionar chave → Criar nova chave**.
4. Tipo: **JSON**. Clique **Criar**.
5. O navegador faz download do arquivo `argus-cbmes-sheets-XXXXXX.json`. **Guarde com cuidado** — esse arquivo dá acesso de escrita à planilha.

## Passo 5 — Compartilhar a planilha-DB com a SA

1. Abra a [planilha-DB](https://docs.google.com/spreadsheets/d/1-Z0Bn-WpNoUjPOfAp8ZeO0trlHbgiZEcMoqfPUqr-Xk/edit).
2. Clique em **Compartilhar** (canto superior direito).
3. Cole o email da SA (`argus-sheets-writer@<project>.iam.gserviceaccount.com`).
4. Permissão: **Editor**.
5. **Desmarque** "Notificar pessoas" (não precisa avisar a SA por email 😅).
6. Clique **Compartilhar**.

## Passo 6 — Converter chave JSON para base64

### Windows (PowerShell)

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\caminho\para\argus-cbmes-sheets-XXXXXX.json"))
```

Copie a string base64 inteira (longa, sem quebras de linha).

### macOS / Linux

```bash
base64 -w0 argus-cbmes-sheets-XXXXXX.json
```

(no macOS, omitir `-w0`).

## Passo 7 — Configurar variáveis de ambiente

### Local (apps/api/.env)

Adicione ao seu `.env`:

```env
SHEETS_DB_ID=1-Z0Bn-WpNoUjPOfAp8ZeO0trlHbgiZEcMoqfPUqr-Xk
GOOGLE_SHEETS_SA_KEY_BASE64=<cole-aqui-a-string-base64-do-passo-6>
```

### Produção (Render / backend host)

1. Painel do Render (ou equivalente) → seu serviço → **Environment**.
2. Adicionar:
   - `SHEETS_DB_ID` = `1-Z0Bn-WpNoUjPOfAp8ZeO0trlHbgiZEcMoqfPUqr-Xk`
   - `GOOGLE_SHEETS_SA_KEY_BASE64` = `<base64>`
3. Save → o backend vai redeployar.

**⚠️ NUNCA commitar a chave JSON ou a string base64 no repo.** O `.gitignore` já protege `.env` e `.env.local`, mas confirme antes de cada PR.

## Passo 8 — Verificar funcionamento

```bash
pnpm dev:api
```

Logs esperados na primeira execução:

```
[SheetsDbService] Sheets-DB bootstrap: bd_escala_mensal=criada, bd_escala_especial=criada, bd_notas_servico=criada
```

Em rodadas subsequentes:

```
[SheetsDbService] Sheets-DB bootstrap: bd_escala_mensal=OK, bd_escala_especial=OK, bd_notas_servico=OK
```

Abra a planilha-DB no navegador — você deve ver as 3 abas com cabeçalhos preenchidos.

## Troubleshooting

| Erro                                                                            | Causa provável                   | Solução                                                |
| ------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------ |
| `Sheets-DB desabilitado (faltam SHEETS_DB_ID e/ou GOOGLE_SHEETS_SA_KEY_BASE64)` | Env vars não definidas           | Confirme que o `.env` foi carregado e contém ambas     |
| `GOOGLE_SHEETS_SA_KEY_BASE64 não é JSON válido`                                 | Base64 truncado ao copiar/colar  | Re-gere base64 sem quebras de linha (`-w0` no Linux)   |
| `403 The caller does not have permission`                                       | SA não compartilhada como Editor | Refazer Passo 5; verificar email exato da SA           |
| `404 Requested entity was not found`                                            | `SHEETS_DB_ID` errado            | Conferir ID extraído da URL da planilha                |
| `429 Quota exceeded`                                                            | Rate limit (60 req/min/SA)       | Sheets-DB tem cache 60s; se persistir, reduzir polling |

## Próximos passos

- **S2.2** integra os services existentes (Escalas/Especial/NS) com o `SheetsDbService` (dual-write).
- **S2.3** adiciona endpoint de re-import com diff e bloqueio se dia tem Prévia iniciada.
- **S2.9** migra para Supabase + Prisma (Sheets-DB vira backup/exportação).

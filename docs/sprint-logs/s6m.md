# Sprint S6m — Parser PDF de Notas de Serviço

**Data:** 2026-05-10
**Foco:** Parser dos PDFs institucionais em `data/Nota de Serviço/NS*.pdf`
para pré-preencher o formulário de NS no frontend.
**Tech Lead:** 2º SGT Heitor Barcellos Coelho

> Sprint pequeno (~1d). Complementa S6l (CRUD manual de NS, PR #12) com
> import via PDF que extrai código, descrição, militares, viatura, data e
> hora dos PDFs reais.

## Critérios de Pronto S6m (DoD)

- [x] **F1** Dependência `pdf-parse` instalada em `apps/api`.
- [x] **F2** `nota-servico-pdf-parser.ts` extrai código (`NS001`),
      finalidade (descrição), NFs (regex `\b\d{7}\b`), data (com
      inferência de ano via código), horário (HHhMMmin), viatura.
      Devolve `avisos[]` quando algo não bate (ex.: múltiplas datas).
- [x] **F3** Endpoint `POST /notas-servico/preview-pdf` com
      `FileInterceptor` (multer, max 5MB) + RBAC
      `admin/sargenteante/fiscal`. Não persiste — devolve preview
      editável.
- [x] **F4** Frontend: `<ImportarPdfButton>` na página
      `/cadastros/notas-servico`. Click → upload → preview pré-preenche o
      formulário existente do S6l (com militares já resolvidos via
      `efetivoFindByNf` para mostrar posto + nome).
- [x] **F5** Tests do parser usando PDFs reais como fixture
      (`data/Nota de Serviço/`), com `it.skipIf` para CI sem `data/`.
      6 cenários cobrindo NS001 (3 grupos por data) e NS002 (lista
      linear) + erro em PDF inválido.
- [x] Backend 286 → **292 passing**. Pipeline: typecheck + lint +
      format + build verdes.

## Estratégia do parser

PDFs CBMES têm layout padronizado mas com variações. Parser extrai:

| Campo         | Confiabilidade | Fonte                                       |
| ------------- | -------------- | ------------------------------------------- |
| **Código**    | Alta           | `NOTA DE SERVIÇO Nº NNN/AAAA` → `NSNNN`     |
| **Descrição** | Média          | Primeira frase de "1 FINALIDADE"            |
| **NFs**       | Alta           | Regex `\b\d{7}\b` (NFs CBMES têm 7 dígitos) |
| **Data**      | Variável       | "3.1 Data: ..." — múltiplos formatos        |
| **Hora**      | Média          | "3.2 Horário: HHhMMmin às HHhMMmin"         |
| **Viatura**   | Média          | "3.5 Viatura: <prefixo>"                    |

Parser **não tenta extrair tudo perfeitamente**. Devolve sugestões +
`avisos[]`, e o user edita no formulário antes de confirmar.

## Métricas

- **Arquivos novos:** 3
  - `apps/api/src/modules/notas-servico/nota-servico-pdf-parser.ts`
  - `apps/api/src/modules/notas-servico/nota-servico-pdf-parser.test.ts`
  - `docs/sprint-logs/s6m.md`
- **Arquivos modificados:** 4
  - `apps/api/package.json` (deps: `pdf-parse` + `@types/pdf-parse`)
  - `apps/api/src/modules/notas-servico/notas-servico.controller.ts`
  - `apps/web/src/lib/api.ts`
  - `apps/web/src/pages/notas-servico.tsx`
- **Tests:** 286 (S6l) → **292** (S6m) — +6 cenários novos
- **Pipeline:** typecheck ✅ lint ✅ format ✅ build ✅
  tests **292/292** ✅

## Próximo passo

- **S5b** (adiado): Persistência Prisma+Supabase + deploy.
- **S9:** Escrita real no MF (Puppeteer).
- **S10/S11:** Parte Diária consumindo composicaoMf + ideoStatus +
  dispensas + atestados + notasServico + alterações diversas.

# CLAUDE.md — Diretrizes para o Claude Code no projeto ARGUS CBMES

## Contexto

ARGUS CBMES — Sistema de Gestão Operacional do 1º BBM. **Fase 1** focada em acoplamento aos
instrumentos vigentes da 1ª Cia/1º BBM (Vitória/ES) com baixo impacto operacional.

- **Tech Lead / Admin / Fiscal Charlie:** 2º SGT Heitor Barcellos Coelho — NF 3037509
- **Documentos de referência (em `data/`):**
  - `ARGUS_CBMES_PRD_v2.0.pdf` — Product Requirements Document
  - `ARGUS_CBMES_Plano_Sprints_Fase1.pdf` — Plano de Sprints S0–S12
- **Workspace:** `c:\dev\argus-cbmes\`
- **Ambiente:** Windows 10, PowerShell + Bash (Git for Windows), Node 20+, pnpm 11+

## Stack tecnológica (Fase 1)

| Camada       | Escolha                                                                                      |
| ------------ | -------------------------------------------------------------------------------------------- |
| Frontend     | React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui (a adicionar) — PWA mobile-first     |
| Backend      | Node.js 20 + NestJS 10 + Prisma 5 + Zod                                                      |
| DB           | PostgreSQL gerenciado pela Supabase                                                          |
| Hospedagem   | Vercel (frontend) — backend a definir (Vercel Functions, Render ou Railway)                  |
| Sheets       | Google Sheets API v4 — auth a definir antes do S2 (Service Account rejeitada pelo Tech Lead) |
| Geração PDF  | Puppeteer (S11)                                                                              |
| Geração DOCX | Biblioteca `docx` npm (S11)                                                                  |
| Testes       | **Vitest** (unificado frontend e backend — consolidação da auditoria R-4)                    |

## Estrutura do repositório (monorepo pnpm)

```
argus-cbmes/
├── apps/
│   ├── web/           # Frontend React + Vite + Tailwind (PWA)
│   │   ├── src/
│   │   │   ├── modules/        # cadastros-mestre, previa, servico, etc. (a criar)
│   │   │   ├── components/     # shadcn/ui customizados
│   │   │   ├── lib/
│   │   │   ├── styles/
│   │   │   ├── test/
│   │   │   └── mocks/          # MOCK DATA até S5
│   │   └── public/manifest.json (S12 PWA)
│   └── api/           # Backend NestJS
│       ├── src/
│       │   └── modules/
│       │       ├── health/     # /health endpoint
│       │       └── (futuros: cadastros-mestre, previa, servico, etc.)
│       └── prisma/
│           ├── schema.prisma
│           └── migrations/     (vazio até S5)
├── packages/
│   ├── shared-types/  # Zod schemas compartilhados (a criar conforme necessário)
│   └── ui/            # Design tokens (a criar)
├── docs/
│   ├── adr/           # ADR-001+
│   ├── sprint-logs/   # s0.md, s1.md, ...
│   ├── exemplos/      # Exemplos institucionais (prévias, PDs)
│   ├── integracoes/   # Mapeamentos Mapa Força, formatos XLSX
│   └── runbooks/      # Procedimentos operacionais
├── infra/
│   └── supabase/      # Migrations específicas Supabase, RLS
├── .github/workflows/ # CI
├── data/              # Arquivos de referência (gitignored — não versionar)
├── .env.example
├── CLAUDE.md          # ESTE ARQUIVO
├── tsconfig.base.json
├── pnpm-workspace.yaml
└── package.json
```

## Comandos principais

```bash
# Instalar tudo
pnpm install

# Dev — paralelo web + api
pnpm dev
pnpm dev:web         # só frontend (porta 5173)
pnpm dev:api         # só backend (porta 3000)

# Build
pnpm build           # tudo
pnpm --filter web build
pnpm --filter api build

# Test (Vitest unificado)
pnpm test
pnpm --filter web test
pnpm --filter api test

# Typecheck
pnpm typecheck

# Lint + Format
pnpm lint
pnpm format          # auto-fix
pnpm format:check    # CI

# Prisma (api)
pnpm --filter api prisma:generate
pnpm --filter api prisma:migrate:dev
```

## Estratégia 'UX First'

Cada módulo é construído primeiro com **dados simulados (mock)** em `apps/web/src/mocks/`. Quando o
módulo está validado por champions, conecta-se ao backend real via Supabase.

- **NÃO crie endpoints de backend antes** que o módulo de UI esteja funcionando com mock validado
- Persistência real (Supabase) entra a partir do **Sprint S5** (marco arquitetural)
- Antes de S5: localStorage / IndexedDB / mock JSON são suficientes
- Após S5: novos módulos já são integrados direto

## Prioridades da Fase 1 (ordem rígida)

```
S0 (Setup) → S1 (Auth + RBAC) → S2 (Cadastros — leitura)
→ S3 (Cadastros — Fiscais e Escala XLSX) → S4 (Prévia) → S5 (Serviço)
→ S6/S7/S8 (Conferências Equipe/Viatura/Materiais)
→ S9 (Mapa Força — escrita) → S10/S11 (Parte Diária)
→ S12 (Hardening + UAT + Go-live)
```

## Vocabulário institucional — preserve sempre

ChOp, COV, IDEO, Mapa Força, prévia do Mapa Força, escala especial, ISEO, parte diária, ABTS, AR, ATB, AM, AC, TE, AU, sentinela, ronda noturna, faxina, dispensa-recompensa, escalas A/B/C/D
(ALFA/BRAVO/CHARLIE/DELTA), QBMP-0, QOC, QOA, NF (número funcional), ANT (antiguidade — número
inteiro, menor = mais antigo).

## Princípios de engenharia

- **Mobile-first absoluto.** Toda tela começa no celular (375×812px). Toques ≥ 44×44px (RNF-021)
- **TypeScript estrito** (`strict: true` em todos os tsconfig.json)
- **Zod** em todos os pontos de entrada (controllers, formulários, env vars)
- **Trilha de auditoria** automática via Prisma middleware nas entidades críticas (RF-CC-705)
- **LGPD by design:** nunca logar CPF, dados pessoais sensíveis, payloads completos
- **Commits convencionais** (`feat:`, `fix:`, `chore:`, `test:`, `docs:`, `refactor:`)
- **Branches por feature:** `feat/<sprint>-<modulo>-<descricao-curta>` — ex.: `feat/s4-previa-formulario`
- **PR a cada feature pronta** (mesmo trabalhando solo, abrir PR para review próprio)
- **ADRs em `docs/adr/`** para decisões arquiteturais
- **Testes ao lado do código:** `feature.ts` + `feature.test.ts`
- **Comentários só para 'porquê' não-óbvio**, nunca para descrever 'o quê'
- **Sem `console.log` em produção** — usar logger estruturado
- **Arquivos ≤ 300 linhas, funções ≤ 50 linhas** (limites flexíveis)

## NÃO faça

- ❌ Bibliotecas de UI inflexíveis (Material-UI, Chakra). Use **shadcn/ui** + Tailwind
- ❌ Microsserviços. Monolito modular
- ❌ Commitar credentials Google/Supabase. Sempre via Vercel Environment Variables
- ❌ Armazenar CPF/senha em texto plano em log algum
- ❌ `localStorage` para dados sensíveis (use IndexedDB criptografado se necessário)
- ❌ Código de IA generativa nesta fase — vem na Fase 2 (APH)
- ❌ Substituir sistemas externos (BAON, ECOPS, e-Docs, SAFO) na Fase 1
- ❌ Service Account Google **(rejeitada pelo Tech Lead)** — usar OAuth User Delegation ou alternativa

## Cenário primário de teste

Reproduzir o fluxo do dia **23/04/2026 da Equipe CHARLIE** — exemplo institucional usado nos
documentos. Toda funcionalidade da Fase 1 deve permitir reproduzir esse fluxo do início ao fim.

Arquivos-chave em `data/`:

- `data/Escala de Serviço/04 ABRIL DE 2026.xlsx` — escala de abril contendo 23/04
- `data/Escala de Serviço/05 MAIO DE 2026.xlsx` — formato canônico do parser (Sprint S3)
- `data/Fase1/2026.05.04_-_1ªCIA_1BBM.pdf` — referência de Parte Diária real (Sprint S10/S11)
- `data/Nota de Serviço/NS 01 - 100/NS072 ...` e `NS074 ...` — citados no exemplo da Prévia

## Integração Mapa Força (CIODES) — informações-chave

- Spreadsheet ID: `1EWuQwuPBkihzrNQ4OGo9AIibbdBK-el1KHMHo71BVCc`
- Aba: `1º BBM` (gid `1468029336`)
- A4 contém timestamp da última escrita (usado para status PREENCHIDO/PENDENTE)
- Conta institucional anchor: `operacional.1cia.1bbm@gmail.com`
- Auth concreta: **a definir antes de S2** (rejeitada Service Account; provável OAuth User Delegation)

## Estado atual do projeto

**Sprint atual: S0 (Setup e Fundação)** — em curso (iniciado 2026-05-08).

DoD do S0 está em `docs/sprint-logs/s0.md`.

## Para o agente Claude Code

Quando trabalhar neste repositório:

1. **Sempre leia `docs/sprint-logs/s<N>.md` antes de iniciar trabalho** — contém DoD do sprint atual
2. **Antes de criar arquivos novos**, verifique se já existe um padrão similar nos módulos existentes
3. **Em caso de dúvida sobre vocabulário institucional**, prefira o termo do PRD/Plano (em `data/`)
4. **Não inicie integração com Mapa Força** sem antes consultar o Tech Lead sobre a estratégia de auth
5. **Não suba dev server em background** sem necessidade — typecheck + test cobrem 90% das verificações

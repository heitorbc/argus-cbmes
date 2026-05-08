# ADR-001 — Stack Tecnológica da Fase 1

**Data:** 2026-05-08
**Status:** Aceito
**Sprint:** S0
**Decisor:** 2º SGT Heitor Barcellos Coelho (Tech Lead)

## Contexto

A Fase 1 do ARGUS CBMES precisa entregar 6 módulos em 13 sprints com um único desenvolvedor (Tech
Lead acumulando funções de Fiscal Charlie + Admin + Dev). A escolha da stack precisa equilibrar:

- **Velocidade de desenvolvimento** com auxílio do Claude Code (extensão VS Code)
- **Mobile-first** como cenário primário (PRD §10), não como adaptação
- **Ecossistema TypeScript** ponta-a-ponta para tipagem compartilhada
- **Hospedagem com mínimo overhead operacional** (single dev, sem time de DevOps)
- **Integração crítica com Google Sheets** (Mapa Força do CIODES)
- **Conformidade institucional** (LGPD, auditoria, RBAC)

## Decisão

Adotar a stack consolidada documentada no PRD v2.0 §9.2:

| Camada              | Escolha                                                                    |
| ------------------- | -------------------------------------------------------------------------- |
| Frontend            | React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui (PWA mobile-first) |
| Backend             | Node.js 20 + NestJS 10 + Prisma 5 + Zod                                    |
| DB                  | PostgreSQL gerenciado pela Supabase                                        |
| Hospedagem frontend | Vercel                                                                     |
| Hospedagem backend  | Vercel Functions ou Render/Railway (decisão antes do S5)                   |
| Sheets API          | Google Sheets API v4 (auth a definir antes do S2)                          |
| Geração PDF         | Puppeteer (Sprint S11)                                                     |
| Geração DOCX        | Biblioteca `docx` npm (Sprint S11)                                         |
| Testes              | Vitest unificado (frontend + backend)                                      |
| Lint/Format         | ESLint 9 (flat config) + Prettier 3                                        |
| Monorepo            | pnpm 11 workspaces (sem Turborepo na Fase 1)                               |

## Consequências

### Positivas

- **TypeScript ponta-a-ponta** permite compartilhar Zod schemas entre frontend/backend via
  `packages/shared-types/`
- **NestJS modular** alinha com a estrutura de módulos do PRD (cadastros-mestre, previa, servico, ...)
- **Vitest unificado** elimina dor de manter Jest no backend e Vitest no frontend (consolida R-4 da
  auditoria interna)
- **Vercel + Supabase** dispensam preocupação operacional para o single dev na Fase 1
- **Prisma** dá type safety completa sobre o DB com migrations versionadas
- **shadcn/ui copy-paste** evita lock-in de biblioteca pesada e permite design tokens institucionais

### Negativas / Trade-offs

- **NestJS em Vercel Functions** exige serverless wrapper (não é o padrão clássico). Pode forçar
  migração para Render/Railway antes de S5
- **pnpm 11 strict build approval** é nova em pnpm 11 e exige `onlyBuiltDependencies` em
  `package.json` para esbuild, NestJS, Prisma — pequena curva de aprendizado
- **Vitest no backend NestJS** ainda não é o padrão da comunidade (Jest é); risco de incompatibilidade
  com bibliotecas de teste específicas do Nest. Mitigado pelo escopo limitado dos testes
- **Sem Turborepo** sacrifica cache de builds incrementais; aceitável dado o tamanho atual do projeto

## Alternativas consideradas

1. **Next.js full-stack** — descartada por trazer SSR/SSG não necessário e por dificultar separação
   clara entre `apps/web` e `apps/api`
2. **Express.js no backend** (em vez de NestJS) — descartada por NestJS oferecer estrutura modular
   melhor para o crescimento previsto (Fase 2 com APH adiciona ainda mais módulos)
3. **Drizzle ORM** (em vez de Prisma) — Drizzle é mais leve mas Prisma tem ecossistema mais maduro
   para Supabase; Prisma escolhido pela menor fricção
4. **Hospedagem completa em Render** (frontend + backend) — Vercel oferece preview deploys melhores
   para frontend; Render fica como opção para backend se Vercel Functions não for suficiente
5. **Service Account Google** — rejeitada pelo Tech Lead em 2026-05-08 (auth a definir antes do S2)

## Referências

- PRD v2.0 §9 (Arquitetura e Stack Tecnológico)
- Plano de Sprints S0
- Auditoria interna do plano (recomendação R-4 — consolidação de testes em Vitest)

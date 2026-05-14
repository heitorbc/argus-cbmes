# ARGUS CBMES — Product Requirements Document v2.1

**1º Batalhão Bombeiro Militar — 1ª Companhia (Vitória/ES)**

| Campo | Valor |
|---|---|
| Documento | Product Requirements Document (PRD) v2.1 |
| Status | Atualizado pós-homologação e go-live de Fase 1 |
| Data de emissão | 14 de maio de 2026 |
| Responsável técnico / Admin | 2º SGT Heitor Barcellos Coelho — NF 3037509 |
| Aprovador | Comandante 1ª Cia/1º BBM |
| Classificação | Uso Interno — CBMES |
| URL produção | https://argus-cbmes.vercel.app |
| Repositório | https://github.com/heitorbc/argus-cbmes |

---

## Histórico de revisões

| Versão | Data | Descrição |
|---|---|---|
| 0.1 | 30/04/2026 | Template inicial |
| 1.0 | 06/05/2026 | Consolidação AS-IS; APH com IA priorizada |
| 2.0 | 06/05/2026 | Fase 1 redesenhada para baixo impacto operacional; APH movida para Fase 2 |
| **2.1** | **14/05/2026** | **Atualização pós-homologação refletindo 13 sprints originais + 11 sub-sprints S6 + 5 séries de PRs de polimento; inclui módulos novos (Dispensas, Atestados, NS, Férias, Trocas, Unidades, Recursos, Escalas Especiais, ChOp, Materiais) e bloqueios remanescentes para Fase 2** |

### O que muda de v2.0 para v2.1

1. **Sistema em produção** com 33/45 RFs implementados (73%); frontend Vercel + backend deployado.
2. **Service Account Google rejeitada** pelo Tech Lead — substituída por CSV público com cache (ADR-003). Escrita no Mapa Força permanece bloqueada e move-se para Fase 1.5.
3. **Persistência Supabase/Prisma adiada** — sistema em produção opera com mock in-memory; dados não sobrevivem restart. Sprint S5b move-se para Fase 1.5.
4. **Escopo expandido** — 14 módulos novos entregues além do PRD v2.0: Dispensas canônicas (I–VIII), Atestados médicos, Notas de Serviço com parser PDF, Férias, Trocas Autorizadas com reconciliação, Unidades, Recursos ad-hoc, Escalas Especiais XLSM, Chefes de Operação, Conferência de Materiais por tipo de viatura, Alterações Diversas (timeline), Persona Picker (homologação), histórico de KM, calendário aquático M01/M02.
5. **PDF via Puppeteer substituído** por `window.print()` + DOCX server-side (lib `docx`); restrição de bundle no Vercel inviabilizou Chromium.
6. **RBAC ampliado** de 7 para 12 papéis (inclui almoxarife, sargenteante operacional).
7. **Viaturas QDV-driven** — lista vem da planilha QDV (1BBM_1CIA + BASE_LISTA + BASE_VTR_LISTA_PRINCIPAL + Contatos), enriquecida com Mapa Força; tela de detalhe com campos editáveis e histórico audit.
8. **Roadmap Fase 1.5** introduzido — cobre os gaps de Fase 1 antes da Fase 2 (APH com IA).

---

## 1. Estado atual do produto

### 1.1. Cobertura por módulo (PRD v2.0)

| Módulo | RFs originais | Implementados | Modificados | Não-implementados |
|---|---|---|---|---|
| CM — Cadastros Mestre | 6 | 6 | 1 (RF-CM-101 sync 06h → on-demand) | 0 |
| PR — Prévia do Mapa Força | 5 | 5 | 1 (composição expandida) | 0 |
| SV — Serviço | 3 | 3 | 0 | 0 |
| MF — Mapa Força (integração) | 4 | 0 | 0 | 4 (RF-MF-401 a 404 — bloqueio auth) |
| CF — Conferências | 6 | 6 | 1 (Viatura expandida) | 0 |
| PD — Parte Diária | 5 | 4 | 1 (PDF → DOCX) | 0 (RF-PD-620 deferido) |
| CC — Cross-cutting | 4 | 2 | 0 | 2 (auditoria hash; PWA offline) |

### 1.2. Módulos novos entregues (não previstos no PRD v2.0)

| # | Módulo | Sprint/PR | Função |
|---|---|---|---|
| 1 | **Dispensas (I–VIII)** | S6j | 8 tipos canônicos com limites + saldo por militar |
| 2 | **Atestados médicos** | S6k | CID-10 + dias + CRM; 3 lugares de entrada |
| 3 | **Notas de Serviço** | S6l + S6m | CRUD + parser PDF para preview pré-preenchido |
| 4 | **Férias** | item-4 (PR #26) | Cadastro mês previsto por militar |
| 5 | **Trocas Autorizadas** | item-1 + S0.5/PR4 | Reconciliação militarRaw → NF; integração Prévia |
| 6 | **Unidades cadastrais** | S6d/S6e | Subseções configuráveis (CRUD admin) |
| 7 | **Recursos ad-hoc** | S6d/S6e + PR #37 | Ativar recurso em runtime na Prévia |
| 8 | **Escalas Especiais (XLSM)** | S6a + PR #35 | Parser dedicado matutino/vespertino/ISEO |
| 9 | **Chefes de Operação (ChOp)** | S6a-fix | Planilha externa CSV; integração Prévia |
| 10 | **Alterações Diversas (timeline)** | S6b | Log datado de eventos do turno |
| 11 | **Persona Picker** | PR #17 | Tela de seleção de 7 personas (homologação) |
| 12 | **Conferência de Materiais por viatura** | S8 | Checklist hardcoded por tipo (ABTS/AR/...) |
| 13 | **Histórico de KM da viatura** | PR #38 | Audit log embedded (manual_admin/conferencia/ocorrencia) |
| 14 | **Calendário aquático (M01/M02)** | PR #36 | Override quinzenal para Mergulho |

### 1.3. Métricas de sucesso revisadas

| Indicador | Meta v2.0 | Estado atual | Observação |
|---|---|---|---|
| Tempo de produção da Prévia | ≤5min | ✅ ~2min em uso real | Aderência confirmada em homologação cruzada |
| Tempo de produção PD | ≤30min | ⚠️ Não medido formalmente | Pendente UAT estruturado |
| Tempo de preenchimento MF externo | ≤60s | ❌ Não-aplicável | Escrita real não-implementada |
| Adesão do efetivo | 80% em 30d | ⏳ Pré-medição | Sistema em uso restrito (homologação) |
| Disponibilidade integração MF | 99,5% | ❌ Não-aplicável | Idem |
| Conformidade documental PD | 100% | ✅ DOCX no padrão | Validado contra PDs reais |
| Cobertura de testes | ≥60% | ⚠️ ~401 API + 27 web | Coverage formal não medida |

---

## 2. Stack tecnológico real

| Camada | PRD v2.0 | Estado atual | Desvio |
|---|---|---|---|
| Frontend | React 18 + Vite + Tailwind + shadcn/ui + TanStack Query + Zustand | React 18 + Vite + Tailwind ✅; **sem shadcn/ui** (componentes custom); **sem TanStack Query** (fetch direto); **sem Zustand** (useState + context) | Stack simplificada |
| Backend | Node.js 20 + NestJS + Prisma + Zod | NestJS 10.4 + Zod ✅; **Prisma instalado mas schema vazio** | Persistência mock |
| Banco | PostgreSQL Supabase | ❌ Não-conectado | **Sprint S5b adiado** |
| Hospedagem app | Vercel | ✅ Frontend Vercel; backend em Render/Railway | Conforme |
| Integração Sheets | Google Service Account JWT | ❌ **Rejeitada** — usa CSV público (ADR-003) | Pivô crítico |
| PDF | Puppeteer (Chromium) | ❌ Não-instalado — usa `window.print()` | Bundle inviável em Vercel |
| DOCX | Lib `docx` (npm) | ✅ `docx@9.6.1` server-side builder | Conforme |
| Auth | NF + bcrypt própria | ✅ JWT HS256 8h, cookie httpOnly, bcrypt cost 12 | Conforme |
| Cache/filas | Não previsto | Não-utilizado (cache TTL em memória nos parsers) | Conforme |
| Observabilidade | Vercel Logs + Sentry | ⚠️ Vercel Logs apenas; **Sentry não-configurado** | Pendente |
| CI/CD | GitHub Actions + Vercel | ✅ Lint + typecheck + test em cada PR; deploy Vercel automático | Conforme (CI falha Node 20 vs pnpm 11 — issue infra) |

---

## 3. Decisões arquiteturais registradas (ADRs)

| ADR | Decisão | Status |
|---|---|---|
| ADR-001 | Stack tecnológica monorepo pnpm + NestJS + React | ACEITO |
| ADR-002 | Auth: JWT HS256 + bcrypt; sem MFA na Fase 1 | ACEITO |
| ADR-003 | Leitura Sheets via CSV público (sem Service Account) | ACEITO |
| ADR-004 | Parser escala XLSX posicional com avisos não-fatais | ACEITO |
| ADR-005 | Composição da Prévia orquestra 5 fontes com 6 tipos de inconsistência | ACEITO |
| ADR-006 | Leitura Mapa Força via CSV público (read-only); escrita deferida | ACEITO |
| ADR-007 | Edição pós-import e ajustes pré-turno em `AjustesPreviaService` | ACEITO |
| ADR-008 | Efetivo: 3 fontes (DADOS > 1ª1º > EFETIVO) com merge enriquecedor | ACEITO |
| ADR-009 | Viaturas: nomenclatura MF (DISPONIVEL/BAIXADA/EMPRESTADA) + `origem` (mapa_forca / override_admin) | ACEITO |
| ADR-010 | Fontes da Prévia do dia (consolidação 5 fontes) | ACEITO |
| ADR-011 | Mapeamento `composicaoMf` (1 entrada por recurso) vs. `tripulacao` (1 por militar) | ACEITO |
| ADR-012 | Estado do dia Serviço (NAO_INICIADO → INICIADO → ENCERRADO) sem deadline de horário | ACEITO |

---

## 4. Roadmap Fase 1.5 (gaps remanescentes da Fase 1)

A Fase 1.5 cobre os requisitos do PRD v2.0 que ficaram bloqueados ou adiados e é **pré-requisito para Fase 2 (APH com IA)**.

### Sprint S5b — Persistência real (Supabase + Prisma)

**Objetivo:** transformar mock in-memory em PostgreSQL persistente. Crítico para produção real.

**Entregas:**
- Schema Prisma populado com todas as entidades (Usuario, Militar, Viatura, Escala, PreviaMapaForca, Servico, ConferenciaEquipe, ConferenciaViatura, ConferenciaMateriais, ParteDiaria, PD_Secao, TrilhaAuditoria, Dispensa, Atestado, NotaServico, Ferias, Troca, Unidade, Recurso, EscalaEspecial, ChefeOperacao, AlteracaoDiversa).
- Migrations versionadas; seeds para 1ª Cia.
- Migração dos serviços in-memory para Prisma.
- Backup automático Supabase + restore documentado.
- **Bloqueio:** dados de homologação atuais serão perdidos no go-live (aceito).

**Estimativa:** 2 semanas.

### Sprint S9 — Escrita no Mapa Força (Fase 1.5)

**Objetivo:** implementar RF-MF-401 a RF-MF-404 sem Service Account.

**Opções (a decidir pelo Tech Lead):**

1. **OAuth User Delegation** com `operacional.1cia.1bbm@gmail.com`
   - Fiscal autoriza uma vez; token refresh server-side
   - Vantagem: usuário institucional já existe; sem Google Cloud Console
   - Risco: token expirado pode bloquear preenchimento
2. **Puppeteer + login automatizado**
   - Bot navega a planilha como humano
   - Vantagem: contorna API totalmente
   - Risco: frágil a mudanças no UI Google; CAPTCHAs
3. **Google Apps Script webhook**
   - Script GAS no contexto da planilha recebe HTTP POST
   - Vantagem: roda como dono da planilha (sem auth client-side)
   - Risco: latência; manutenção dupla (TypeScript + GAS)

**Recomendação:** Opção 1 (OAuth) como primeira tentativa, com Opção 3 como fallback.

**Entregas:**
- RF-MF-401 — Botão "Preencher Mapa Força" habilitado por Conferências completas
- RF-MF-402 — Preview com diff campo a campo
- RF-MF-403 — Escrita transacional + atualiza A4 com timestamp
- RF-MF-404 — Retentativa + diagnóstico + alerta admin após 3 falhas em 5min
- Logs estruturados de toda tentativa (ts, payload, resposta, status)

**Estimativa:** 2 semanas.

### Sprint S12 — Hardening + UAT + Go-live oficial

**Objetivo:** estabilizar Fase 1 para uso operacional contínuo.

**Entregas:**
- **Trilha de auditoria estruturada** (RF-CC-705): tabela `TrilhaAuditoria` append-only com hash encadeado; retenção 5 anos; consulta admin-only.
- **PWA com modo offline** (RF-CC-710 + RNF-002): service worker + IndexedDB; sincronização ao retornar; resolução de conflitos last-write-wins com aviso visual.
- **Reset senha por e-mail funcional** (RF-CC-701 complemento): auto-serviço.
- **Sentry** configurado para errors em produção.
- **Cobertura de testes ≥60%** nos módulos PR, MF, PD (RNF-030).
- **Auditoria WCAG 2.1 AA / eMAG** (RNF-022).
- **UAT estruturado** com champions: 1º SGT Heverton, 2º SGT Mariane, 2º SGT Júlio, CB Vicente, SD Martinelli.
- **Documentação operacional final**: runbook admin, manual do Fiscal, manual do Motorista.
- **Treinamento da 1ª Cia** (presencial + vídeos curtos).
- **Go-live oficial** com comunicado institucional.

**Estimativa:** 3 semanas.

### Itens menores remanescentes da Fase 1

| Item | RF original | Sprint |
|---|---|---|
| Job agendado 06h para sync efetivo | RF-CM-101 | S5b (após Supabase) |
| Notificação push/e-mail "Nova escala disponível" | RF-CM-110 critério | S12 |
| OpenAPI spec publicado | RF-CC-720 | S12 |
| MFA opcional admin (preparação Fase 2) | RF-CC-701 | S12 |
| Job de backup automático Supabase | RNF-011 | S5b |
| PDF server-side via Puppeteer (alternativa) | RF-PD-620 | Reavaliar S12 — se DOCX cobrir, **descartar** |

---

## 5. Roadmap Fase 2+ (mantido do PRD v2.0, com refinamentos)

### Fase 2 — APH com IA generativa

Conteúdo conforme PRD v1.0 (preservado):
- Módulo APH completo: formulário estruturado de coleta + geração de relato técnico assistida pela API da Anthropic (Claude).
- Integração com BAON e ECOPS.
- LGPD para dados sensíveis de vítimas e DPA com Anthropic.
- **Pré-requisito:** Fase 1.5 concluída (persistência, auditoria, MF escrita).

### Fase 3 — Efetivo CRUD completo + Escalas

- Módulo Efetivo com edição plena (CRUD) substituindo a planilha do Sargenteante.
- Sincronização SAFO.
- Módulo de Escalas substituindo o XLSX/JPEG mensal.
- Trocas de serviço digitais (já parcialmente entregue como Trocas Autorizadas em Fase 1).
- ISEO/NS digitais (já parcialmente entregue como NS em Fase 1).

### Fase 4 — Viaturas avançadas + Agenda + Integrações estaduais

- Checklist completo de Conferência de Materiais com QR Code e fotos (Fase 1 entrega apenas o binário Sem/Com Alteração + checklist hardcoded por tipo).
- Gestão de viaturas com manutenção (ordens de serviço, peças).
- Agenda diferenciada por perfil.
- Integrações e-Docs (PD tramitação automática), BAON (ocorrências), ECOPS, SAFO, SIARHES.
- Módulo de Ocorrências (deslocamentos, registros completos).

### Fase 5+ — Expansão

- Replicação para outras OBMs do CBMES.
- Integração com sistemas estaduais.
- Módulos especializados (REPDEC, SAT).
- BI gerencial.

---

## 6. Riscos atualizados

| ID | Risco | Probabilidade | Impacto | Mitigação atual |
|---|---|---|---|---|
| R-01 | Falha persistente integração Mapa Força (escrita) | Média | Crítico | Modo degradado com instrução manual; Fase 1.5/S9 prioritária |
| R-02 | Resistência de Fiscais alternativos ao sistema | Média | Alto | Persona Picker permite homologação cruzada com champions diversos |
| R-03 | Mudança de formato XLSX da escala mensal | Média | Médio | Parser robusto com validação + avisos não-fatais; fallback manual |
| R-04 | Desalinhamento modelo de equipes (Mergulho/Salvamar) | Baixa | Médio | Calendário aquático M01/M02 + abas QDV próprias mitigaram |
| R-05 | Acúmulo de papéis no Tech Lead | Alta | Médio | CLAUDE.md extensivo; ADRs registrados; sprint logs detalhados |
| R-06 | Vazamento credentials | Baixa | Crítico | ADR-003 elimina Service Account; CSV público sem segredos |
| R-07 | CPF como senha inicial vazado | Baixa | Alto | Troca obrigatória no 1º acesso; hash bcrypt; auditoria 1º login |
| R-08 | Mudança de comando antes do go-live | Média | Médio | Entregas em produção continuamente (Vercel); demonstrável |
| **R-09 (novo)** | **Mock in-memory perde dados em deploy** | **Alta** | **Médio** | **Sistema atualmente em homologação; S5b prioritária antes uso operacional** |
| **R-10 (novo)** | **CI quebrada (Node 20 vs pnpm 11)** | **Resolvido pendente** | **Baixo** | **Vercel deploy não-bloqueado; ajustar GitHub Action para Node 22** |

---

## 7. Anexos

### Anexo I — Glossário adicional (v2.1)

- **QDV (Quadro de Distribuição de Viaturas)** — Planilha mestre com as 4 abas usadas: `1BBM_1CIA` (operacional diário), `BASE_LISTA` (cadastro detalhado da Cia), `BASE_VTR_LISTA_PRINCIPAL` (todas as viaturas CBMES), `Contatos_LOGISTICAS` (responsáveis logísticos por OBM).
- **Composição MF** — Estrutura `composicaoMf` (1 entrada por recurso do Mapa Força) usada para escrita futura; difere de `tripulacao` (1 entrada por militar) usada para exibição na Prévia.
- **NomeMatcher** — Algoritmo de 3 níveis (posto+nome → nome → tokens com normalização NFD) para reconciliar militares vindos de fontes diferentes.
- **Ajustes pré-turno** — Conjunto de overrides aplicados sobre a composição da Prévia: trocas, dispensas, atestados, swaps de militares, ativações ad-hoc de recurso, overrides Mergulho M01↔M02. Persistidos em `AjustesPreviaService`.
- **Persona Picker** — Tela de homologação que permite alternar entre 7 personas pré-definidas para validar RBAC.
- **Recurso ad-hoc** — Recurso (ex.: RESGATE 02) ativado pelo Fiscal em runtime mesmo não estando na composição vigente do MF.

### Anexo II — Arquitetura de pastas atual

```
argus-cbmes/
├── apps/
│   ├── web/                        # Frontend React + Vite + Tailwind (PWA pendente S12)
│   │   ├── src/
│   │   │   ├── pages/              # 25+ páginas (login, home, previa, viaturas, ...)
│   │   │   ├── components/         # militar-select, etc. (custom — sem shadcn/ui)
│   │   │   ├── lib/                # api.ts, auth-context, permissions, whatsapp, status-viatura-style
│   │   │   └── mocks/              # (vazio — mocks vivem no backend)
│   │   └── public/manifest.json    # PWA scaffold
│   └── api/                        # Backend NestJS
│       ├── src/modules/
│       │   ├── auth/               # NF+senha, JWT, RBAC, persona-picker
│       │   ├── efetivo/            # 3 fontes CSV público
│       │   ├── viaturas/           # CRUD interno + QDV-driven enriquecido
│       │   ├── escalas/            # Parser XLSX + Mergulho/Salvamar
│       │   ├── escalas-especiais/  # Parser XLSM matutina/vespertina
│       │   ├── previa/             # Orquestração 5 fontes + ajustes
│       │   ├── servico/            # Máquina de estados do dia
│       │   ├── conferencia-equipe/
│       │   ├── conferencia-viatura/
│       │   ├── materiais/          # Conferência por tipo de viatura
│       │   ├── parte-diaria/       # Composição + DOCX server-side
│       │   ├── ideo/               # Matriz dia×tipo + status do dia
│       │   ├── fiscais/            # Override do default por menor ANT
│       │   ├── dispensas/          # 8 tipos canônicos + saldos
│       │   ├── atestados/          # CID-10 + integrações
│       │   ├── notas-servico/      # CRUD + parser PDF
│       │   ├── ferias/             # Cadastro mês previsto
│       │   ├── trocas-autorizadas/ # Reconciliação NF
│       │   ├── unidades/           # Subseções configuráveis
│       │   ├── recursos/           # Recursos ad-hoc
│       │   ├── chefes-operacoes/   # ChOp CSV externo
│       │   ├── mapa-forca/         # Leitura CSV público (escrita pendente)
│       │   └── integracoes/        # Status das planilhas
│       └── prisma/                 # Schema placeholder (S5b pendente)
├── packages/
│   └── shared-types/               # ~25 schemas Zod compartilhados
├── docs/
│   ├── adr/                        # 12 ADRs
│   ├── sprint-logs/                # 27 sprint logs (S0 → S6m + pd-lock + persona-picker)
│   └── exemplos/                   # Prévias e PDs reais para validação
└── CLAUDE.md                       # Diretrizes para Claude Code
```

### Anexo III — Estrutura da Parte Diária

Mantida do PRD v1.0/v2.0 — 17 seções na ordem padrão:
1. Cabeçalho institucional
2. Identificação (equipe + datas)
3. Assunção do serviço
4. Escala operacional (com KM inicial das Conferências de Viatura)
5. Trocas (registradas pelos Chefes na Conferência de Equipe)
6. Escala de guarda (sentinelas + DRO; com armamento)
7. Mergulho (compartilha equipe terrestre)
8. Salvamar (compartilha equipe terrestre)
9. Chefe de Operações (ChOp)
10. Atestado IDEO (texto padrão pelo Fiscal)
11. Alterações de viaturas (das Conferências de Viatura/Materiais)
12. Alterações Diversas (timeline editável pelo Fiscal)
13. Ronda noturna (sugerida automaticamente)
14. Escala de faxina
15. Cumprimento de NS/OS/NI (das Notas de Serviço)
16. Alteração de Almoxarifado (da Conferência de Materiais)
17. Ocorrências confeccionadas (manual com VTR + BAON + código)

### Anexo IV — Champions de validação

| Persona | NF | Papel | Função no projeto |
|---|---|---|---|
| 1º SGT Heverton | TBD | Fiscal Equipe A | Validação UX cross-Fiscal |
| 2º SGT Mariane | TBD | Fiscal Equipe B | Validação UX cross-Fiscal |
| 2º SGT Júlio | TBD | Fiscal Equipe D | Validação UX cross-Fiscal |
| 1º SGT De Mattos | TBD | Sargenteante | Validação Sargenteação |
| SD Cauã Lyra | TBD | DRO/Sentinela | Validação Conferência |
| CB Vicente | TBD | Motorista | Validação Conferência Viatura |
| SD Martinelli | TBD | Operador | Validação Conferência Materiais |
| SGT Jezreel | TBD | Almoxarife | Validação visão Logística |

---

## 8. Próximas decisões pendentes

1. **Auth Mapa Força (S9)** — Tech Lead deve escolher entre OAuth User Delegation, Puppeteer, ou Google Apps Script.
2. **Quando migrar para Supabase (S5b)** — definir janela de migração e estratégia de dados (homologação descartável vs. preservação seletiva).
3. **PDF server-side opcional** — se DOCX cobrir 100% dos casos, descartar RF-PD-620 oficialmente.
4. **MFA na Fase 2 ou antecipar S12** — decidir com base em diagnóstico de segurança da Diretoria.
5. **Service Account Google** — manter recusada permanentemente ou reavaliar com Comando para Fase 2.

---

**— FIM DO PRD v2.1 —**

*Documento gerado com base em análise automatizada de 61 commits, 27 sprint logs, 12 ADRs e PRD v2.0 original. Para discussão das decisões pendentes acima, ver Comitê mensal com Comandante.*

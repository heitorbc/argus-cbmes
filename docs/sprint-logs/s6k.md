# Sprint S6k — Atestados médicos (módulo + integrações)

**Data:** 2026-05-10
**Foco:** Item 1.3 da rodada S6h–S6l. Entidade Atestado canônica, registro
em 3 lugares, integração na Prévia (alterações de efetivo).
**Tech Lead:** 2º SGT Heitor Barcellos Coelho

> Quarto sprint da rodada (S6h ✅ PR #8, S6i ✅ PR #9, S6j ✅ PR #10).
> Mesmo padrão arquitetural de Dispensas (S6j): entidade canônica + CRUD
> em /cadastros/atestados + integração Prévia + ajuste pré-turno.

## Critérios de Pronto S6k (DoD)

- [x] **F1** `atestadoSchema` (id, militarNf, dataInicio, dias, cid10,
      crmMedico, observacoes?) + helper `atestadoAtivoNoDia`.
- [x] **F2** `previaAtestadoSchema` + `previa.atestados[]` no payload.
- [x] **F3** `AtestadosService` (in-memory) com CRUD + `listAtivosNoDia`.
- [x] **F4** `AtestadosController` REST: GET, POST (admin/sarg/fiscal),
      PUT/DELETE (admin/sarg).
- [x] **F5** `PreviaService` injeta `AtestadosService` e popula
      `previa.atestados` com `listAtivosNoDia(data)` enriquecido.
- [x] **F6** Página `/cadastros/atestados` (Sargenteação) com CRUD admin.
- [x] **F7** `<AtestadosFieldset>` no ajuste pré-turno da Prévia.
- [x] **F8** Perfil do militar ganha card "Atestados médicos no ano YYYY".
- [x] **F9** Home: card "🏥 Atestados" em Sargenteação.
- [x] +7 cenários de teste novos. Backend 271 → **278 passing**.
- [x] Pipeline: typecheck + lint + format + build verdes.

## Registro em 3 lugares

Conforme requisito do Tech Lead, o Atestado pode ser criado em:

1. **Módulo `/cadastros/atestados`** (Sargenteação) — CRUD completo.
2. **Ajuste pré-turno** da Prévia (`<AtestadosFieldset>`).
3. **Durante o serviço** — fluxo de Alterações Diversas (S6b/F6) já
   permite via API; UI dedicada futura se necessário.

## Próximo passo

- **S6l:** Notas de Serviço CRUD manual + ajuste pré-turno (~2d).
- **S6m (futuro):** Parser PDF de NS.
- **S5b:** Persistência Prisma+Supabase + deploy Vercel.

-- S2.13a — Hierarquia de Unidades + User.unidadeId
--
-- Adiciona:
-- 1. `Unidade.tipo` (varchar, default 'companhia') — batalhao | companhia | posto_avancado
-- 2. `Unidade.unidadePaiId` (FK auto-referência, nullable) — pai na hierarquia
-- 3. `Unidade.criacaoAutomatica` (bool, default false) — S2.13f flag para LOCAL desconhecido
-- 4. `User.unidadeId` (FK Unidade, nullable) — lotação do usuário (NULL para admin/legado)
-- 5. Backfill: 1ª Cia (codigo '1ª1º') ganha tipo='companhia' e unidadePaiId='unid:1bbm'
--    Cria registro '1º BBM' (id='unid:1bbm', tipo='batalhao') se não existir
--
-- ON DELETE: RESTRICT em ambas FKs — não permite apagar unidade ou usuário com filhos/lotados.

-- 1. Unidade ganha colunas
ALTER TABLE "unidades" ADD COLUMN "tipo" TEXT NOT NULL DEFAULT 'companhia';
ALTER TABLE "unidades" ADD COLUMN "unidadePaiId" TEXT;
ALTER TABLE "unidades" ADD COLUMN "criacaoAutomatica" BOOLEAN NOT NULL DEFAULT false;

-- 2. FK auto-referência
ALTER TABLE "unidades"
  ADD CONSTRAINT "unidades_unidadePaiId_fkey"
  FOREIGN KEY ("unidadePaiId") REFERENCES "unidades"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "unidades_unidadePaiId_idx" ON "unidades"("unidadePaiId");

-- 3. Cria 1º BBM (batalhão raiz) se não existir
INSERT INTO "unidades" ("id", "codigo", "nome", "tipo", "unidadePaiId", "ativo", "criacaoAutomatica", "criadoEm", "atualizadoEm")
VALUES ('unid:1bbm', '1º BBM', '1º Batalhão de Bombeiro Militar', 'batalhao', NULL, true, false, NOW(), NOW())
ON CONFLICT ("codigo") DO NOTHING;

-- 4. Backfill 1ª Cia → companhia, pai = 1º BBM
UPDATE "unidades"
SET "tipo" = 'companhia',
    "unidadePaiId" = 'unid:1bbm'
WHERE "codigo" = '1ª1º';

-- 5. User.unidadeId
ALTER TABLE "users" ADD COLUMN "unidadeId" TEXT;
ALTER TABLE "users"
  ADD CONSTRAINT "users_unidadeId_fkey"
  FOREIGN KEY ("unidadeId") REFERENCES "unidades"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "users_unidadeId_idx" ON "users"("unidadeId");

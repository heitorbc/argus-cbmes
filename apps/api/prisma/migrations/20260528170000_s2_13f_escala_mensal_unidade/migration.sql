-- S2.13f — EscalaMensal ganha unidadeId (multi-unidade)
--
-- Estratégia em 2 fases para evitar quebra de registros existentes:
-- 1. Adiciona `unidadeId` nullable + FK Unidade
-- 2. Backfill: escalas existentes (todas da 1ª Cia) → unidadeId = 'unid:1cia-1bbm'
-- 3. Substitui constraint unique (ano, mes) por (ano, mes, unidadeId)
-- 4. Adiciona index em unidadeId
--
-- ON DELETE SET NULL para tolerar remoção da Unidade sem cascata destrutiva
-- (admin pode reorganizar; escalas ficam órfãs e admin reorganiza depois).

-- 1. Adiciona coluna nullable
ALTER TABLE "escalas_mensais" ADD COLUMN "unidadeId" TEXT;

-- 2. FK
ALTER TABLE "escalas_mensais"
  ADD CONSTRAINT "escalas_mensais_unidadeId_fkey"
  FOREIGN KEY ("unidadeId") REFERENCES "unidades"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 3. Backfill: escalas existentes são todas da 1ª Cia (sistema pré-S2.13f
--    funcionou só nessa unidade)
UPDATE "escalas_mensais"
SET "unidadeId" = 'unid:1cia-1bbm'
WHERE "unidadeId" IS NULL;

-- 4. Substitui constraint unique
ALTER TABLE "escalas_mensais" DROP CONSTRAINT "escalas_mensais_ano_mes_key";
ALTER TABLE "escalas_mensais"
  ADD CONSTRAINT "escalas_mensais_ano_mes_unidadeId_key"
  UNIQUE ("ano", "mes", "unidadeId");

-- 5. Index para filtros por unidade
CREATE INDEX "escalas_mensais_unidadeId_idx" ON "escalas_mensais"("unidadeId");

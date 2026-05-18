-- S2.10.7d — Integração planilha "Dispensas 2026":
--   + colunas minuta (Nº BG), equipe (texto livre), origem (manual|planilha)
--   + unique compound (militarNf, dataInicio, tipo) para idempotência da sync
--   + novo tipo IX_OUTRAS (validado em código, não em CHECK constraint)
--   + criadoPorNf nullable (sync não tem User humano)

-- AlterTable
ALTER TABLE "dispensas" ADD COLUMN "minuta" TEXT;
ALTER TABLE "dispensas" ADD COLUMN "equipe" TEXT;
ALTER TABLE "dispensas" ADD COLUMN "origem" TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE "dispensas" ALTER COLUMN "criadoPorNf" DROP NOT NULL;

-- CreateIndex (compound unique para upsert da sync)
CREATE UNIQUE INDEX "dispensas_militarNf_dataInicio_tipo_key" ON "dispensas"("militarNf", "dataInicio", "tipo");

-- CreateTable
CREATE TABLE "conferencias_cov" (
    "id" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "vtrPrefixo" TEXT NOT NULL,
    "motoristaNf" TEXT NOT NULL,
    "termoAceitoEm" TIMESTAMP(3) NOT NULL,
    "checklist" JSONB NOT NULL,
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conferencias_cov_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compartimentos_materiais" (
    "id" TEXT NOT NULL,
    "contexto" TEXT NOT NULL,
    "contextoLabel" TEXT NOT NULL,
    "compartimento" TEXT NOT NULL,
    "materiais" JSONB NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "compartimentos_materiais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conferencias_materiais" (
    "id" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "contexto" TEXT NOT NULL,
    "realizadoPorNf" TEXT NOT NULL,
    "realizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "itens" JSONB NOT NULL,
    "observacao" TEXT,

    CONSTRAINT "conferencias_materiais_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conferencias_cov_data_idx" ON "conferencias_cov"("data");

-- CreateIndex
CREATE UNIQUE INDEX "conferencias_cov_data_vtrPrefixo_motoristaNf_key" ON "conferencias_cov"("data", "vtrPrefixo", "motoristaNf");

-- CreateIndex
CREATE INDEX "compartimentos_materiais_contexto_idx" ON "compartimentos_materiais"("contexto");

-- CreateIndex
CREATE INDEX "conferencias_materiais_data_idx" ON "conferencias_materiais"("data");

-- CreateIndex
CREATE UNIQUE INDEX "conferencias_materiais_data_contexto_key" ON "conferencias_materiais"("data", "contexto");


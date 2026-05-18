-- CreateTable
CREATE TABLE "aprovacoes_previa_itens" (
    "id" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "decididoPorNf" TEXT NOT NULL,
    "decididoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aprovacoes_previa_itens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "aprovacoes_previa_itens_data_idx" ON "aprovacoes_previa_itens"("data");

-- CreateIndex
CREATE UNIQUE INDEX "aprovacoes_previa_itens_data_tipo_itemId_key" ON "aprovacoes_previa_itens"("data", "tipo", "itemId");

-- S2.10.8a — Tabela de histórico de sincronizações com planilhas externas
-- (SyncOrchestratorService). Cada sync (startup, cron, manual) grava 1 row.

-- CreateTable
CREATE TABLE "sync_logs" (
    "id" TEXT NOT NULL,
    "fonte" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "created" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "erros" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "trigger" TEXT NOT NULL,
    "duracaoMs" INTEGER NOT NULL DEFAULT 0,
    "iniciadoEm" TIMESTAMP(3) NOT NULL,
    "finalizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sync_logs_fonte_finalizadoEm_idx" ON "sync_logs"("fonte", "finalizadoEm");

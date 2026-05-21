-- S2.10.11b — ChefesOperações multi-mês.
-- Antes: replace-all com 1 mês de cada vez, schema `@@id([nf, dia])`.
-- Agora: histórico de N meses, oficiais de toda a instituição (não só 1ª Cia).
-- Drop+recreate é seguro porque dados anteriores serão re-importados no
-- próximo sync (apenas mês corrente estava armazenado).

DROP TABLE "chefe_operacoes_escala";

CREATE TABLE "chefe_operacoes_escala" (
    "ano" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "nf" TEXT NOT NULL,
    "dia" INTEGER NOT NULL,
    "marcador" TEXT NOT NULL,
    "posto" TEXT NOT NULL,
    "nomeGuerra" TEXT NOT NULL,
    "telefone" TEXT,
    "sincronizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chefe_operacoes_escala_pkey" PRIMARY KEY ("ano", "mes", "nf", "dia")
);

CREATE INDEX "chefe_operacoes_escala_ano_mes_dia_idx" ON "chefe_operacoes_escala"("ano", "mes", "dia");
CREATE INDEX "chefe_operacoes_escala_nf_idx" ON "chefe_operacoes_escala"("nf");

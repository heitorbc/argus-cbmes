-- S2.10.9a — ChefesOperações + QDV (4 abas) em Postgres.
-- Anteriormente cache in-memory (TTL 5min); agora persistido para eliminar
-- Google fetch em runtime + cron 00/06/12/18h via SyncOrchestrator.

-- CreateTable: Escala mensal de ChOp.
-- Replace-all strategy: cada sync apaga tudo e insere o snapshot atual.
CREATE TABLE "chefe_operacoes_escala" (
    "nf" TEXT NOT NULL,
    "dia" INTEGER NOT NULL,
    "marcador" TEXT NOT NULL,
    "posto" TEXT NOT NULL,
    "nomeGuerra" TEXT NOT NULL,
    "telefone" TEXT,
    "sincronizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chefe_operacoes_escala_pkey" PRIMARY KEY ("nf", "dia")
);

CREATE INDEX "chefe_operacoes_escala_dia_idx" ON "chefe_operacoes_escala"("dia");

-- CreateTable: QDV aba 1BBM_1CIA (operacional).
CREATE TABLE "viaturas_qdv" (
    "prefixo" TEXT NOT NULL,
    "status" TEXT,
    "emprestadaA" TEXT,
    "kmAtual" INTEGER,
    "observacao" TEXT,
    "empregoPrimario" TEXT,
    "empregoSecundario" TEXT,
    "placa" TEXT,
    "marcaModelo" TEXT,
    "combustivel" TEXT,
    "obm" TEXT,
    "sincronizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "viaturas_qdv_pkey" PRIMARY KEY ("prefixo")
);

-- CreateTable: QDV aba BASE_LISTA (cadastro mestre por OBM).
CREATE TABLE "viaturas_qdv_base_lista" (
    "prefixo" TEXT NOT NULL,
    "obm" TEXT NOT NULL,
    "nomenclatura" TEXT,
    "ano" TEXT,
    "status" TEXT,
    "emprestadaA" TEXT,
    "kmAtual" INTEGER,
    "observacao" TEXT,
    "empregoPrimario" TEXT,
    "empregoSecundario" TEXT,
    "placa" TEXT,
    "renavam" TEXT,
    "categoriaCnh" TEXT,
    "marcaModelo" TEXT,
    "combustivel" TEXT,
    "modeloPneu" TEXT,
    "sincronizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "viaturas_qdv_base_lista_pkey" PRIMARY KEY ("prefixo")
);

CREATE INDEX "viaturas_qdv_base_lista_obm_idx" ON "viaturas_qdv_base_lista"("obm");

-- CreateTable: QDV aba BASE_VTR_LISTA_PRINCIPAL (CBMES inteiro).
CREATE TABLE "viaturas_cbmes" (
    "prefixo" TEXT NOT NULL,
    "prefixoComUnderscore" TEXT NOT NULL,
    "obm" TEXT NOT NULL,
    "nomenclatura" TEXT,
    "ano" TEXT,
    "idade" TEXT,
    "observacao" TEXT,
    "placa" TEXT,
    "renavam" TEXT,
    "categoriaCnh" TEXT,
    "tipoVeiculo" TEXT,
    "marcaModelo" TEXT,
    "combustivel" TEXT,
    "modeloPneu" TEXT,
    "sincronizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "viaturas_cbmes_pkey" PRIMARY KEY ("prefixo")
);

CREATE INDEX "viaturas_cbmes_obm_idx" ON "viaturas_cbmes"("obm");

-- CreateTable: QDV aba Contatos_LOGISTICAS (responsável por OBM).
CREATE TABLE "contatos_logisticos" (
    "obm" TEXT NOT NULL,
    "nf" TEXT NOT NULL,
    "militarResponsavel" TEXT NOT NULL,
    "nomeCompleto" TEXT,
    "telefone" TEXT,
    "email" TEXT,
    "sincronizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contatos_logisticos_pkey" PRIMARY KEY ("obm")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "nf" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "posto" TEXT NOT NULL,
    "ant" INTEGER NOT NULL,
    "papeis" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "senhaHash" TEXT NOT NULL,
    "primeiroAcesso" BOOLEAN NOT NULL DEFAULT true,
    "ultimoLoginEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "militares" (
    "nf" TEXT NOT NULL,
    "ant" INTEGER NOT NULL,
    "posto" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "nomeGuerra" TEXT,
    "funcao" TEXT,
    "unidade" TEXT,
    "subSecao" TEXT,
    "postoPrevisto" TEXT,
    "municipio" TEXT,
    "idade" INTEGER,
    "servico" INTEGER,
    "situacao" TEXT,
    "lotacao" TEXT,
    "classe" TEXT,
    "conceitoDisciplinar" TEXT,
    "pontos" INTEGER,
    "cnh" TEXT,
    "cnhValidade" TEXT,
    "incorporacao" TEXT,
    "planoFerias" TEXT,
    "mergulho" TEXT,
    "ftba" TEXT,
    "etsp" TEXT,
    "ccve" TEXT,
    "ccveValidade" TEXT,
    "censo" TEXT,
    "origensFonte" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "papelEspecial" TEXT,
    "sincronizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "militares_pkey" PRIMARY KEY ("nf")
);

-- CreateTable
CREATE TABLE "viaturas" (
    "id" TEXT NOT NULL,
    "prefixo" TEXT NOT NULL,
    "placa" TEXT,
    "tipo" TEXT,
    "funcaoOperacional" TEXT,
    "anoModelo" INTEGER,
    "status" TEXT,
    "origem" TEXT,
    "composicaoFuncoes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "observacoes" TEXT,
    "kmAtual" INTEGER,
    "tipoCombustivel" TEXT,
    "usaArla32" BOOLEAN,
    "capacidadeTanqueLitros" DOUBLE PRECISION,
    "capacidadeTanqueArlaLitros" DOUBLE PRECISION,
    "estadoTanquePercent" INTEGER,
    "alturaMetros" DOUBLE PRECISION,
    "larguraMetros" DOUBLE PRECISION,
    "militarResponsavelNf" TEXT,
    "historicoKm" JSONB,
    "observacoesDataDas" JSONB,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "viaturas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unidades" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "unidades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locais_faxina" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "locais_faxina_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escalas_mensais" (
    "id" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "origemArquivo" TEXT NOT NULL,
    "importadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importadoPorNf" TEXT,
    "diaEquipe" JSONB NOT NULL,
    "avisos" JSONB,
    "mergulho" JSONB,
    "salvamar" JSONB,
    "ultimoDiaQ1" INTEGER NOT NULL DEFAULT 14,

    CONSTRAINT "escalas_mensais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "composicao_entries" (
    "id" TEXT NOT NULL,
    "escalaMensalId" TEXT NOT NULL,
    "quinzena" INTEGER NOT NULL,
    "equipe" TEXT NOT NULL,
    "viatura" TEXT NOT NULL,
    "funcao" TEXT NOT NULL,
    "militarRaw" TEXT NOT NULL,
    "militarNf" TEXT,
    "militarPosto" TEXT,
    "militarNomeGuerra" TEXT,

    CONSTRAINT "composicao_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escalas_especiais" (
    "id" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "origemArquivo" TEXT NOT NULL,
    "importadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importadoPorNf" TEXT,
    "avisos" JSONB,

    CONSTRAINT "escalas_especiais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escala_especial_atos" (
    "id" TEXT NOT NULL,
    "escalaEspecialId" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "militarRaw" TEXT NOT NULL,
    "militarNf" TEXT,
    "horario" TEXT NOT NULL,
    "funcao" TEXT NOT NULL,

    CONSTRAINT "escala_especial_atos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notas_servico" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "horaInicio" TEXT NOT NULL,
    "horaFim" TEXT NOT NULL,
    "viaturaPrefixo" TEXT,
    "militaresNfs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "observacoes" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPorNf" TEXT NOT NULL,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "notas_servico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ideo_entries" (
    "id" TEXT NOT NULL,
    "dia" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "itens" JSONB NOT NULL,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "atualizadoPorNf" TEXT,

    CONSTRAINT "ideo_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ideo_checklists" (
    "id" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "equipamentos" JSONB NOT NULL,
    "motivoNaoRealizacao" TEXT,
    "geradoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atestadoEm" TIMESTAMP(3),
    "atestadoPorNf" TEXT,

    CONSTRAINT "ideo_checklists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trocas_autorizadas" (
    "id" TEXT NOT NULL,
    "registradoEm" TEXT NOT NULL,
    "emailRegistrante" TEXT,
    "statusTroca" TEXT,
    "statusNome" TEXT,
    "dataEscala" TEXT NOT NULL,
    "escaladoOriginal" TEXT NOT NULL,
    "escaladoOriginalNf" TEXT,
    "substituto" TEXT NOT NULL,
    "substitutoNf" TEXT,
    "funcao" TEXT NOT NULL,
    "horario" TEXT NOT NULL,
    "dataPagamento" TEXT NOT NULL,
    "escaladoPagamento" TEXT NOT NULL,
    "substitutoPagamento" TEXT NOT NULL,
    "funcaoPagamento" TEXT NOT NULL,
    "horarioPagamento" TEXT NOT NULL,
    "isDobra48h" BOOLEAN NOT NULL DEFAULT false,
    "numeroEdocs" TEXT,
    "numeroRegistro" TEXT,
    "sincronizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trocas_autorizadas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispensas" (
    "id" TEXT NOT NULL,
    "militarNf" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "dataInicio" TEXT NOT NULL,
    "dias" INTEGER NOT NULL,
    "numeroEdocs" TEXT,
    "observacoes" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPorNf" TEXT NOT NULL,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "dispensas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "atestados" (
    "id" TEXT NOT NULL,
    "militarNf" TEXT NOT NULL,
    "dataInicio" TEXT NOT NULL,
    "dias" INTEGER NOT NULL,
    "cid10" TEXT,
    "crmMedico" TEXT,
    "observacoes" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPorNf" TEXT NOT NULL,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "atestados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ferias" (
    "id" TEXT NOT NULL,
    "militarNf" TEXT NOT NULL,
    "mesAno" TEXT NOT NULL,
    "dataInicio" TEXT NOT NULL,
    "dias" INTEGER NOT NULL DEFAULT 30,
    "observacoes" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoPorNf" TEXT NOT NULL,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ferias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iseo_hospitais" (
    "id" TEXT NOT NULL,
    "unidade" TEXT NOT NULL,
    "posto" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "nf" TEXT,
    "dataIso" TEXT NOT NULL,
    "turno" TEXT NOT NULL,
    "funcao" TEXT,
    "contato" TEXT,
    "cargaHoraria" TEXT,
    "obm" TEXT,
    "lotacao" TEXT,
    "sincronizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "iseo_hospitais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mapa_forca_diarios" (
    "id" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "dia" INTEGER NOT NULL,
    "equipe" TEXT NOT NULL,
    "equipeNome" TEXT NOT NULL,
    "estadoServico" TEXT NOT NULL DEFAULT 'PREVIA',
    "previaIniciadaEm" TIMESTAMP(3),
    "iniciadoEm" TIMESTAMP(3),
    "encerradoEm" TIMESTAMP(3),
    "payload" JSONB NOT NULL,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mapa_forca_diarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incidentes_baon" (
    "codigo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "classificacao" TEXT,

    CONSTRAINT "incidentes_baon_pkey" PRIMARY KEY ("codigo")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_nf_key" ON "users"("nf");

-- CreateIndex
CREATE INDEX "users_deletedAt_idx" ON "users"("deletedAt");

-- CreateIndex
CREATE INDEX "militares_subSecao_idx" ON "militares"("subSecao");

-- CreateIndex
CREATE INDEX "militares_papelEspecial_idx" ON "militares"("papelEspecial");

-- CreateIndex
CREATE UNIQUE INDEX "viaturas_prefixo_key" ON "viaturas"("prefixo");

-- CreateIndex
CREATE INDEX "viaturas_deletedAt_idx" ON "viaturas"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "unidades_codigo_key" ON "unidades"("codigo");

-- CreateIndex
CREATE INDEX "escalas_mensais_ano_mes_idx" ON "escalas_mensais"("ano", "mes");

-- CreateIndex
CREATE UNIQUE INDEX "escalas_mensais_ano_mes_key" ON "escalas_mensais"("ano", "mes");

-- CreateIndex
CREATE INDEX "composicao_entries_escalaMensalId_quinzena_idx" ON "composicao_entries"("escalaMensalId", "quinzena");

-- CreateIndex
CREATE INDEX "composicao_entries_militarNf_idx" ON "composicao_entries"("militarNf");

-- CreateIndex
CREATE INDEX "escalas_especiais_ano_mes_idx" ON "escalas_especiais"("ano", "mes");

-- CreateIndex
CREATE UNIQUE INDEX "escalas_especiais_ano_mes_key" ON "escalas_especiais"("ano", "mes");

-- CreateIndex
CREATE INDEX "escala_especial_atos_escalaEspecialId_idx" ON "escala_especial_atos"("escalaEspecialId");

-- CreateIndex
CREATE INDEX "escala_especial_atos_data_militarNf_idx" ON "escala_especial_atos"("data", "militarNf");

-- CreateIndex
CREATE UNIQUE INDEX "notas_servico_codigo_key" ON "notas_servico"("codigo");

-- CreateIndex
CREATE INDEX "notas_servico_data_idx" ON "notas_servico"("data");

-- CreateIndex
CREATE INDEX "notas_servico_deletedAt_idx" ON "notas_servico"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ideo_entries_dia_tipo_key" ON "ideo_entries"("dia", "tipo");

-- CreateIndex
CREATE INDEX "ideo_checklists_data_idx" ON "ideo_checklists"("data");

-- CreateIndex
CREATE UNIQUE INDEX "ideo_checklists_data_tipo_key" ON "ideo_checklists"("data", "tipo");

-- CreateIndex
CREATE INDEX "trocas_autorizadas_dataEscala_idx" ON "trocas_autorizadas"("dataEscala");

-- CreateIndex
CREATE INDEX "trocas_autorizadas_dataPagamento_idx" ON "trocas_autorizadas"("dataPagamento");

-- CreateIndex
CREATE INDEX "trocas_autorizadas_escaladoOriginalNf_idx" ON "trocas_autorizadas"("escaladoOriginalNf");

-- CreateIndex
CREATE INDEX "trocas_autorizadas_substitutoNf_idx" ON "trocas_autorizadas"("substitutoNf");

-- CreateIndex
CREATE INDEX "dispensas_militarNf_dataInicio_idx" ON "dispensas"("militarNf", "dataInicio");

-- CreateIndex
CREATE INDEX "dispensas_deletedAt_idx" ON "dispensas"("deletedAt");

-- CreateIndex
CREATE INDEX "atestados_militarNf_dataInicio_idx" ON "atestados"("militarNf", "dataInicio");

-- CreateIndex
CREATE INDEX "atestados_deletedAt_idx" ON "atestados"("deletedAt");

-- CreateIndex
CREATE INDEX "ferias_militarNf_mesAno_idx" ON "ferias"("militarNf", "mesAno");

-- CreateIndex
CREATE INDEX "ferias_deletedAt_idx" ON "ferias"("deletedAt");

-- CreateIndex
CREATE INDEX "iseo_hospitais_dataIso_idx" ON "iseo_hospitais"("dataIso");

-- CreateIndex
CREATE INDEX "iseo_hospitais_unidade_idx" ON "iseo_hospitais"("unidade");

-- CreateIndex
CREATE UNIQUE INDEX "iseo_hospitais_unidade_dataIso_turno_nf_key" ON "iseo_hospitais"("unidade", "dataIso", "turno", "nf");

-- CreateIndex
CREATE UNIQUE INDEX "mapa_forca_diarios_data_key" ON "mapa_forca_diarios"("data");

-- CreateIndex
CREATE INDEX "mapa_forca_diarios_ano_mes_idx" ON "mapa_forca_diarios"("ano", "mes");

-- CreateIndex
CREATE INDEX "mapa_forca_diarios_estadoServico_idx" ON "mapa_forca_diarios"("estadoServico");

-- AddForeignKey
ALTER TABLE "escalas_mensais" ADD CONSTRAINT "escalas_mensais_importadoPorNf_fkey" FOREIGN KEY ("importadoPorNf") REFERENCES "users"("nf") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "composicao_entries" ADD CONSTRAINT "composicao_entries_escalaMensalId_fkey" FOREIGN KEY ("escalaMensalId") REFERENCES "escalas_mensais"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escalas_especiais" ADD CONSTRAINT "escalas_especiais_importadoPorNf_fkey" FOREIGN KEY ("importadoPorNf") REFERENCES "users"("nf") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escala_especial_atos" ADD CONSTRAINT "escala_especial_atos_escalaEspecialId_fkey" FOREIGN KEY ("escalaEspecialId") REFERENCES "escalas_especiais"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_servico" ADD CONSTRAINT "notas_servico_criadoPorNf_fkey" FOREIGN KEY ("criadoPorNf") REFERENCES "users"("nf") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ideo_entries" ADD CONSTRAINT "ideo_entries_atualizadoPorNf_fkey" FOREIGN KEY ("atualizadoPorNf") REFERENCES "users"("nf") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ideo_checklists" ADD CONSTRAINT "ideo_checklists_atestadoPorNf_fkey" FOREIGN KEY ("atestadoPorNf") REFERENCES "users"("nf") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispensas" ADD CONSTRAINT "dispensas_militarNf_fkey" FOREIGN KEY ("militarNf") REFERENCES "militares"("nf") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispensas" ADD CONSTRAINT "dispensas_criadoPorNf_fkey" FOREIGN KEY ("criadoPorNf") REFERENCES "users"("nf") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atestados" ADD CONSTRAINT "atestados_militarNf_fkey" FOREIGN KEY ("militarNf") REFERENCES "militares"("nf") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atestados" ADD CONSTRAINT "atestados_criadoPorNf_fkey" FOREIGN KEY ("criadoPorNf") REFERENCES "users"("nf") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ferias" ADD CONSTRAINT "ferias_militarNf_fkey" FOREIGN KEY ("militarNf") REFERENCES "militares"("nf") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ferias" ADD CONSTRAINT "ferias_criadoPorNf_fkey" FOREIGN KEY ("criadoPorNf") REFERENCES "users"("nf") ON DELETE RESTRICT ON UPDATE CASCADE;

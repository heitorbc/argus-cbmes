-- S2.10.13b — Adiciona índice em `unidade` na tabela `militares` para
-- suportar filtro multi-unidade na página /cadastros/efetivo.
--
-- Sem DROP nem DELETE: FKs ON DELETE RESTRICT em Dispensa/Atestado/Ferias
-- inviabilizam apagar dados sem perder cadastros manuais do sargenteante.
-- UPSERT no próximo sync (via botão "🔄 Sincronizar") já garante que
-- todos os militares ganham `unidade` populada (parser remove filtro
-- LOCAL=='1ª1º' em S2.10.13b e popula `unidade` a partir do LOCAL da
-- planilha QDI/DADOS).

CREATE INDEX "militares_unidade_idx" ON "militares"("unidade");

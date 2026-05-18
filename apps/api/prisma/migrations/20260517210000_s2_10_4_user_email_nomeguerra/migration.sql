-- S2.10.4 — Auth Reforçado
-- Adiciona campos email (com unique index) e nomeGuerra ao User.
-- email é nullable; admin pode cadastrar via UI ou usuário preenche no 1º acesso.
-- nomeGuerra é populado no auto-provision via consolidação QDI+EFETIVO.

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "email" TEXT,
ADD COLUMN     "nomeGuerra" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

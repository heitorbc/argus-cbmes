/**
 * Seed Prisma — S2.10.2.
 *
 * Roda uma vez para popular o Postgres com os usuários iniciais do
 * mock-users.ts. Idempotente: usa `upsert` na NF.
 *
 * Execução:
 *   pnpm --filter api exec dotenv -e ../../.env.local -- prisma db seed
 *
 * Ou via script:
 *   pnpm --filter api prisma:seed
 *
 * Em produção (Vercel), o seed NÃO roda automaticamente — Tech Lead executa
 * 1x após o `prisma migrate deploy` da primeira release com Postgres ativo.
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { MOCK_USERS } from '../src/modules/auth/mock-users';

const prisma = new PrismaClient();

async function seedUsers(): Promise<void> {
  const cost = Number(process.env.BCRYPT_COST ?? 12);
  const senhaDefault = 'batalhao01';
  const hashDefault = await bcrypt.hash(senhaDefault, cost);

  let created = 0;
  let updated = 0;

  for (const u of MOCK_USERS) {
    const result = await prisma.user.upsert({
      where: { nf: u.nf },
      create: {
        nf: u.nf,
        nome: u.nome,
        posto: u.posto,
        ant: u.ant,
        papeis: u.papeis,
        // Re-hasheia no momento do seed (o hash do mock-users tem cost 12
        // fixo; respeita BCRYPT_COST do ambiente do seed).
        senhaHash: hashDefault,
        primeiroAcesso: true,
      },
      update: {
        // Atualiza apenas dados não-sensíveis para não sobrescrever senhas
        // já trocadas pelos usuários reais.
        nome: u.nome,
        posto: u.posto,
        ant: u.ant,
        papeis: u.papeis,
      },
    });
    if (result.atualizadoEm.getTime() === result.criadoEm.getTime()) created += 1;
    else updated += 1;
  }

  console.info(
    `Seed users: ${created} criados, ${updated} atualizados (total ${MOCK_USERS.length}).`,
  );
}

async function main(): Promise<void> {
  await seedUsers();
}

main()
  .catch((err: unknown) => {
    console.error('Seed falhou:', err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });

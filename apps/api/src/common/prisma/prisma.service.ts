import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Wrapper NestJS sobre PrismaClient — singleton injetável em qualquer service.
 *
 * - `onModuleInit`: conecta no pool. Falha rápido se DATABASE_URL inválido.
 * - `onModuleDestroy`: fecha o pool em shutdown gracioso.
 *
 * Em serverless (Vercel) o cliente vive entre invocações da mesma instância,
 * por isso usamos `DATABASE_URL` apontando pro pooler (port 6543, transaction
 * mode) com `connection_limit=1` — ver `docs/runbooks/supabase-setup.md`.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Prisma conectado.');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

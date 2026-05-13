import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import type { TrocaAutorizada } from '@argus/shared-types';
import { TrocasAutorizadasService } from './trocas-autorizadas.service';

const listQuerySchema = z.object({
  data: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

/**
 * Item 1 — Endpoint REST das Trocas Autorizadas (read-only).
 *
 *  - `GET /trocas-autorizadas`           — lista todas (cache 5min).
 *  - `GET /trocas-autorizadas?data=YYYY-MM-DD` — só as trocas que afetam a data
 *    (lado escala OU lado pagamento).
 *
 * Sem RBAC restritivo — todos os autenticados leem (read-only de planilha pública).
 */
@Controller('trocas-autorizadas')
export class TrocasAutorizadasController {
  constructor(private readonly svc: TrocasAutorizadasService) {}

  @Get()
  async list(@Query() query: unknown): Promise<TrocaAutorizada[]> {
    const parsed = listQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    }
    if (parsed.data.data) {
      return this.svc.listByData(parsed.data.data);
    }
    return this.svc.listAll();
  }
}

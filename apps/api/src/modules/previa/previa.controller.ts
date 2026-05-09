import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import type { PreviaDoDia } from '@argus/shared-types';
import { PreviaService } from './previa.service';

const querySchema = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

@Controller('previa')
export class PreviaController {
  constructor(private readonly previa: PreviaService) {}

  /**
   * Retorna a Prévia do Mapa Força para a data informada.
   * Acesso aberto a qualquer usuário autenticado — telas de Conferência (S6+) usarão o
   * mesmo objeto; restringir por papel não traz valor.
   */
  @Get()
  async getPrevia(@Query() query: unknown): Promise<PreviaDoDia> {
    const parsed = querySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    }
    return this.previa.getPreviaDoDia(parsed.data.data);
  }
}

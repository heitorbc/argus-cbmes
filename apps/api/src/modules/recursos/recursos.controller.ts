import { BadRequestException, Controller, Get, Param, Query } from '@nestjs/common';
import { z } from 'zod';
import { RecursosService } from './recursos.service';

const listQuerySchema = z.object({
  unidadeId: z.string().optional(),
  ativoSomente: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

@Controller('recursos')
export class RecursosController {
  constructor(private readonly recursos: RecursosService) {}

  @Get()
  list(@Query() query: unknown) {
    const parsed = listQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    }
    return this.recursos.list(parsed.data);
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.recursos.findById(id);
  }
}

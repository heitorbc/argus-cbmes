import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { createRecursoInputSchema, updateRecursoInputSchema } from '@argus/shared-types';
import { Roles } from '../auth/decorators/roles.decorator';
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

  @Roles('admin')
  @Post()
  create(@Body() body: unknown) {
    const parsed = createRecursoInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    }
    return this.recursos.create(parsed.data);
  }

  @Roles('admin')
  @Put(':id')
  update(@Param('id') id: string, @Body() body: unknown) {
    const parsed = updateRecursoInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    }
    return this.recursos.update(id, parsed.data);
  }

  @Roles('admin')
  @Delete(':id')
  softDelete(@Param('id') id: string) {
    return this.recursos.softDelete(id);
  }
}

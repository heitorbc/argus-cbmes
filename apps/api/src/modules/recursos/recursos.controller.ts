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

  // S2.13d — Oficial de Operações também gerencia recursos (além do admin).
  // Backend não filtra por unidade neste momento porque a checagem fina (gate
  // por unidadesVisiveisParaUsuario) entra como middleware compartilhado em
  // S2.14 — por ora o frontend filtra; admin/oficial_operacoes têm acesso
  // CRUD aos recursos da sua unidade.
  @Roles('admin', 'oficial_operacoes')
  @Post()
  create(@Body() body: unknown) {
    const parsed = createRecursoInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    }
    return this.recursos.create(parsed.data);
  }

  @Roles('admin', 'oficial_operacoes')
  @Put(':id')
  update(@Param('id') id: string, @Body() body: unknown) {
    const parsed = updateRecursoInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    }
    return this.recursos.update(id, parsed.data);
  }

  @Roles('admin', 'oficial_operacoes')
  @Delete(':id')
  softDelete(@Param('id') id: string) {
    return this.recursos.softDelete(id);
  }
}

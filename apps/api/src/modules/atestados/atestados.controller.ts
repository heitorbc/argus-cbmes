import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import {
  createAtestadoInputSchema,
  updateAtestadoInputSchema,
  type Atestado,
  type UserSession,
} from '@argus/shared-types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AtestadosService } from './atestados.service';

const listQuerySchema = z.object({
  militarNf: z.string().optional(),
  ano: z
    .string()
    .regex(/^\d{4}$/)
    .optional()
    .transform((s) => (s ? Number(s) : undefined)),
});

@Controller('atestados')
export class AtestadosController {
  constructor(private readonly atestados: AtestadosService) {}

  @Get()
  list(@Query() query: unknown): Atestado[] {
    const parsed = listQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    }
    return this.atestados.list(parsed.data);
  }

  @Get(':id')
  findById(@Param('id') id: string): Atestado {
    return this.atestados.findById(id);
  }

  /**
   * S6k — POST aceita admin/sargenteante/fiscal porque atestados podem ser
   * registrados nos 3 lugares previstos (módulo, pré-turno, durante serviço).
   */
  @Roles('admin', 'sargenteante', 'fiscal')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() body: unknown, @CurrentUser() user: UserSession): Atestado {
    const parsed = createAtestadoInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    }
    return this.atestados.create(parsed.data, user.nf);
  }

  @Roles('admin', 'sargenteante')
  @Put(':id')
  update(@Param('id') id: string, @Body() body: unknown): Atestado {
    const parsed = updateAtestadoInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    }
    return this.atestados.update(id, parsed.data);
  }

  @Roles('admin', 'sargenteante')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): void {
    this.atestados.remove(id);
  }
}

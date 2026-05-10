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
  createNotaServicoInputSchema,
  updateNotaServicoInputSchema,
  type NotaServico,
  type UserSession,
} from '@argus/shared-types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { NotasServicoService } from './notas-servico.service';

const listQuerySchema = z.object({
  data: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  militarNf: z.string().optional(),
});

@Controller('notas-servico')
export class NotasServicoController {
  constructor(private readonly notas: NotasServicoService) {}

  @Get()
  list(@Query() query: unknown): NotaServico[] {
    const parsed = listQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    }
    return this.notas.list(parsed.data);
  }

  @Get(':id')
  findById(@Param('id') id: string): NotaServico {
    return this.notas.findById(id);
  }

  /**
   * S6l — POST aceita admin/sargenteante/fiscal porque NS pode ser
   * cadastrada em 2 fluxos (módulo, ajuste pré-turno).
   */
  @Roles('admin', 'sargenteante', 'fiscal')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() body: unknown, @CurrentUser() user: UserSession): NotaServico {
    const parsed = createNotaServicoInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    }
    return this.notas.createOrConflict(parsed.data, user.nf);
  }

  @Roles('admin', 'sargenteante')
  @Put(':id')
  update(@Param('id') id: string, @Body() body: unknown): NotaServico {
    const parsed = updateNotaServicoInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    }
    return this.notas.update(id, parsed.data);
  }

  @Roles('admin', 'sargenteante')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): void {
    this.notas.remove(id);
  }
}

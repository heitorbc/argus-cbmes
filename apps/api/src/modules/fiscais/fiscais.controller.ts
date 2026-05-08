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
  Query,
} from '@nestjs/common';
import { createFiscalInputSchema, type FiscalVigente } from '@argus/shared-types';
import { z } from 'zod';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { UserSession } from '@argus/shared-types';
import { FiscaisService } from './fiscais.service';

const calcularDefaultQuerySchema = z.object({
  equipe: z.enum(['A', 'B', 'C', 'D']),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

@Controller('fiscais')
export class FiscaisController {
  constructor(private readonly fiscais: FiscaisService) {}

  @Get()
  list() {
    return this.fiscais.list();
  }

  @Roles('admin')
  @Post()
  create(@Body() body: unknown, @CurrentUser() user: UserSession) {
    const parsed = createFiscalInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    }
    return this.fiscais.create(parsed.data, user.nf);
  }

  @Roles('admin')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    this.fiscais.delete(id);
  }

  /**
   * Retorna apenas o cadastro explícito vigente (sem aplicar default).
   * Útil para o frontend mostrar "há override?" antes de chamar a regra completa.
   */
  @Get('cadastrado-vigente')
  getCadastradoVigente(@Query() query: unknown) {
    const parsed = calcularDefaultQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    }
    const cadastrado = this.fiscais.getCadastradoVigente(parsed.data.equipe, parsed.data.data);
    return { cadastrado };
  }

  /**
   * Aplica a regra completa (cadastro → default). Requer lista de escalados (vem da Escala em S3b).
   * Body: `{ equipe, data, escalados: [{nf, ant}] }`.
   */
  @Post('vigente')
  @HttpCode(HttpStatus.OK)
  getVigente(@Body() body: unknown): { fiscal: FiscalVigente | null } {
    const schema = z.object({
      equipe: z.enum(['A', 'B', 'C', 'D']),
      data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      escalados: z.array(z.object({ nf: z.string(), ant: z.number().int().nonnegative() })),
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    }
    const fiscal = this.fiscais.getVigente(
      parsed.data.equipe,
      parsed.data.data,
      parsed.data.escalados,
    );
    return { fiscal };
  }
}

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  registrarConferenciaMateriaisInputSchema,
  type ConferenciaMateriaisDoDia,
  type UserSession,
} from '@argus/shared-types';
import { z } from 'zod';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { MateriaisService } from './materiais.service';

const dataIsoRegex = /^\d{4}-\d{2}-\d{2}$/;

const listQuerySchema = z.object({
  data: z.string().regex(dataIsoRegex),
  vtr: z.string().optional(),
});

/**
 * S8 — REST da Conferência de Materiais.
 *
 *  - GET `/materiais/checklist-padrao/:vtrPrefixo` → lista padrão por tipo
 *    de viatura (read-only, todos autenticados).
 *  - GET `/materiais?data=YYYY-MM-DD&vtr=PREFIXO` → conferência do dia
 *    para 1 viatura (ou todas se `vtr` omitido).
 *  - POST `/materiais` → registra conferência (admin/fiscal/chefe_equipe/
 *    motorista).
 */
@Controller('materiais')
export class MateriaisController {
  constructor(private readonly svc: MateriaisService) {}

  @Get('checklist-padrao/:vtrPrefixo')
  async checklistPadrao(@Param('vtrPrefixo') vtrPrefixo: string): Promise<readonly string[]> {
    return this.svc.getChecklistPadrao(vtrPrefixo);
  }

  @Get()
  list(@Query() query: unknown): ConferenciaMateriaisDoDia | ConferenciaMateriaisDoDia[] {
    const parsed = listQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    }
    if (parsed.data.vtr) {
      const r = this.svc.get(parsed.data.data, parsed.data.vtr);
      if (!r) return [] as ConferenciaMateriaisDoDia[];
      return r;
    }
    return this.svc.listByData(parsed.data.data);
  }

  @Roles('admin', 'fiscal', 'chefe_equipe', 'motorista')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  registrar(@Body() body: unknown, @CurrentUser() user: UserSession): ConferenciaMateriaisDoDia {
    const parsed = registrarConferenciaMateriaisInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    }
    return this.svc.registrar(parsed.data, user.nf);
  }
}

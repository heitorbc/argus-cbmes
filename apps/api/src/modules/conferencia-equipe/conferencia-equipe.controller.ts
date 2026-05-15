import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
} from '@nestjs/common';
import {
  upsertConferenciaEquipeSchema,
  type ConferenciaEquipeEntry,
  type UserSession,
} from '@argus/shared-types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ConferenciaEquipeService } from './conferencia-equipe.service';

const dataParamRegex = /^\d{4}-\d{2}-\d{2}$/;

@Controller('conferencia/equipe')
export class ConferenciaEquipeController {
  constructor(private readonly conferencia: ConferenciaEquipeService) {}

  @Get(':data')
  getByData(@Param('data') data: string): ConferenciaEquipeEntry[] {
    if (!dataParamRegex.test(data)) {
      throw new BadRequestException('data inválida (esperado YYYY-MM-DD)');
    }
    return this.conferencia.getByData(data);
  }

  @Roles('admin', 'chefe_equipe', 'fiscal', 'sargenteante')
  @Put(':data')
  @HttpCode(HttpStatus.OK)
  bulkUpdate(
    @Param('data') data: string,
    @Body() body: unknown,
    @CurrentUser() user: UserSession,
  ): Promise<ConferenciaEquipeEntry[]> {
    if (!dataParamRegex.test(data)) {
      throw new BadRequestException('data inválida (esperado YYYY-MM-DD)');
    }
    const parsed = upsertConferenciaEquipeSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    }
    const isOverride =
      user.papeis.includes('admin') ||
      user.papeis.includes('fiscal') ||
      user.papeis.includes('sargenteante');
    return this.conferencia.bulkUpdate(data, parsed.data, user.nf, isOverride);
  }
}

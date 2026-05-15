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
  upsertConferenciaViaturaSchema,
  type ConferenciaViaturaEntry,
  type UserSession,
} from '@argus/shared-types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ConferenciaViaturaService } from './conferencia-viatura.service';

const dataParamRegex = /^\d{4}-\d{2}-\d{2}$/;

@Controller('conferencia/viatura')
export class ConferenciaViaturaController {
  constructor(private readonly conferencia: ConferenciaViaturaService) {}

  @Get(':data')
  getByData(@Param('data') data: string): ConferenciaViaturaEntry[] {
    if (!dataParamRegex.test(data)) {
      throw new BadRequestException('data inválida (esperado YYYY-MM-DD)');
    }
    return this.conferencia.getByData(data);
  }

  @Roles('admin', 'fiscal', 'motorista', 'sargenteante', 'chefe_equipe')
  @Put(':data/:vtrPrefixo')
  @HttpCode(HttpStatus.OK)
  async registrar(
    @Param('data') data: string,
    @Param('vtrPrefixo') vtrPrefixo: string,
    @Body() body: unknown,
    @CurrentUser() user: UserSession,
  ): Promise<ConferenciaViaturaEntry> {
    if (!dataParamRegex.test(data)) {
      throw new BadRequestException('data inválida (esperado YYYY-MM-DD)');
    }
    const parsed = upsertConferenciaViaturaSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    }
    const isOverride =
      user.papeis.includes('admin') ||
      user.papeis.includes('fiscal') ||
      user.papeis.includes('sargenteante');
    return this.conferencia.registrar(data, vtrPrefixo, parsed.data, user.nf, isOverride);
  }
}

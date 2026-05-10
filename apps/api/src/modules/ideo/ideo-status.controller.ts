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
  upsertIdeoStatusInputSchema,
  type IdeoStatusDoDia,
  type UserSession,
} from '@argus/shared-types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { IdeoStatusService } from './ideo-status.service';

const dataParamRegex = /^\d{4}-\d{2}-\d{2}$/;

@Controller('ideo-status')
export class IdeoStatusController {
  constructor(private readonly status: IdeoStatusService) {}

  @Get(':data')
  getByData(@Param('data') data: string): IdeoStatusDoDia[] {
    if (!dataParamRegex.test(data)) {
      throw new BadRequestException('data inválida (esperado YYYY-MM-DD)');
    }
    return this.status.getByData(data);
  }

  /**
   * S6i — Marca IDEO de um tipo (ABTS/RESGATE) como realizada/não-realizada.
   * Apenas Fiscal de Serviço (ou admin) pode atestar.
   */
  @Roles('admin', 'fiscal', 'sargenteante')
  @Put(':data')
  @HttpCode(HttpStatus.OK)
  upsert(
    @Param('data') data: string,
    @Body() body: unknown,
    @CurrentUser() user: UserSession,
  ): IdeoStatusDoDia {
    if (!dataParamRegex.test(data)) {
      throw new BadRequestException('data inválida (esperado YYYY-MM-DD)');
    }
    const parsed = upsertIdeoStatusInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    }
    return this.status.upsert(data, parsed.data, user.nf);
  }
}

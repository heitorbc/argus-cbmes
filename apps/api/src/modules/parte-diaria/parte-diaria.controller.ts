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
  upsertParteDiariaInputSchema,
  type ParteDiaria,
  type UserSession,
} from '@argus/shared-types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ParteDiariaService } from './parte-diaria.service';

const dataIsoRegex = /^\d{4}-\d{2}-\d{2}$/;

/**
 * S10 — REST da Parte Diária.
 *
 *  - GET  `/parte-diaria/:data`   → leitura pública (admin/sarg/fiscal),
 *    devolve sempre o estado consolidado (rascunho ⊕ override).
 *  - PUT  `/parte-diaria/:data`   → grava override completo. Apenas Fiscal
 *    e admin podem editar.
 */
@Controller('parte-diaria')
export class ParteDiariaController {
  constructor(private readonly svc: ParteDiariaService) {}

  @Roles('admin', 'sargenteante', 'fiscal')
  @Get(':data')
  async get(@Param('data') data: string): Promise<ParteDiaria> {
    if (!dataIsoRegex.test(data)) {
      throw new BadRequestException('Data inválida (esperado YYYY-MM-DD).');
    }
    return this.svc.get(data);
  }

  @Roles('admin', 'fiscal')
  @Put(':data')
  @HttpCode(HttpStatus.OK)
  async upsert(
    @Param('data') data: string,
    @Body() body: unknown,
    @CurrentUser() user: UserSession,
  ): Promise<ParteDiaria> {
    if (!dataIsoRegex.test(data)) {
      throw new BadRequestException('Data inválida (esperado YYYY-MM-DD).');
    }
    const parsed = upsertParteDiariaInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    }
    return this.svc.salvar(data, parsed.data, user.nf);
  }
}

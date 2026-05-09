import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import {
  upsertAjustesPreviaSchema,
  type AjustesPrevia,
  type PreviaDoDia,
} from '@argus/shared-types';
import { Roles } from '../auth/decorators/roles.decorator';
import { AjustesPreviaService } from './ajustes-previa.service';
import { PreviaService } from './previa.service';

const querySchema = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const dataParamRegex = /^\d{4}-\d{2}-\d{2}$/;

@Controller('previa')
export class PreviaController {
  constructor(
    private readonly previa: PreviaService,
    private readonly ajustes: AjustesPreviaService,
  ) {}

  /**
   * Retorna a Prévia do Mapa Força para a data informada.
   * Acesso aberto a qualquer usuário autenticado.
   */
  @Get()
  async getPrevia(@Query() query: unknown): Promise<PreviaDoDia> {
    const parsed = querySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    }
    return this.previa.getPreviaDoDia(parsed.data.data);
  }

  /** F7a — Lê os ajustes pré-turno persistidos para uma data. */
  @Get(':data/ajustes')
  getAjustes(@Param('data') data: string): AjustesPrevia {
    if (!dataParamRegex.test(data)) {
      throw new BadRequestException('data inválida (esperado YYYY-MM-DD)');
    }
    return this.ajustes.get(data);
  }

  /** F7a — Substitui completamente os ajustes pré-turno (overwrite atômico). */
  @Roles('admin', 'fiscal', 'sargenteante')
  @Put(':data/ajustes')
  @HttpCode(HttpStatus.OK)
  upsertAjustes(@Param('data') data: string, @Body() body: unknown): AjustesPrevia {
    if (!dataParamRegex.test(data)) {
      throw new BadRequestException('data inválida (esperado YYYY-MM-DD)');
    }
    const parsed = upsertAjustesPreviaSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    }
    return this.ajustes.upsert(data, parsed.data);
  }
}

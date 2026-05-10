import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import {
  addTrocaEscalaEspecialSchema,
  upsertAjustesPreviaSchema,
  type AjustesPrevia,
  type PreviaDoDia,
  type TrocaEscalaEspecial,
  type UserSession,
} from '@argus/shared-types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
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

  /** S6a-fix item 4 — registra uma troca de Escala Especial por ato. */
  @Roles('admin', 'fiscal', 'sargenteante')
  @Post(':data/ajustes/escala-especial/trocas')
  @HttpCode(HttpStatus.OK)
  addTrocaEscalaEspecial(
    @Param('data') data: string,
    @Body() body: unknown,
    @CurrentUser() user: UserSession,
  ): TrocaEscalaEspecial {
    if (!dataParamRegex.test(data)) {
      throw new BadRequestException('data inválida (esperado YYYY-MM-DD)');
    }
    const parsed = addTrocaEscalaEspecialSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    }
    return this.ajustes.addTrocaEscalaEspecial(data, parsed.data, user.nf);
  }

  /** S6a-fix item 4 — remove uma troca de Escala Especial pelo identificador do ato. */
  @Roles('admin', 'fiscal', 'sargenteante')
  @Delete(':data/ajustes/escala-especial/trocas/:atoKey')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeTrocaEscalaEspecial(@Param('data') data: string, @Param('atoKey') atoKey: string): void {
    if (!dataParamRegex.test(data)) {
      throw new BadRequestException('data inválida (esperado YYYY-MM-DD)');
    }
    const removed = this.ajustes.removeTrocaEscalaEspecial(data, decodeURIComponent(atoKey));
    if (!removed) {
      throw new NotFoundException('Troca de Escala Especial não encontrada para este ato.');
    }
  }
}

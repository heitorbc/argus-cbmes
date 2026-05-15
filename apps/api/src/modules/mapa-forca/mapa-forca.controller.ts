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
  type FiscalDoDia,
  type MapaForcaDoDia,
  type TrocaEscalaEspecial,
  type UserSession,
} from '@argus/shared-types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AjustesPreviaService } from './ajustes-previa.service';
import { MapaForcaService } from './mapa-forca.service';

const querySchema = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const dataParamRegex = /^\d{4}-\d{2}-\d{2}$/;

@Controller('mapa-forca')
export class MapaForcaController {
  constructor(
    private readonly mapaForca: MapaForcaService,
    private readonly ajustes: AjustesPreviaService,
  ) {}

  /**
   * Retorna o Mapa Força do dia informado.
   * Acesso aberto a qualquer usuário autenticado (visualização read-only).
   */
  @Get()
  async getMapaForca(@Query() query: unknown): Promise<MapaForcaDoDia> {
    const parsed = querySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    }
    return this.mapaForca.getMapaForcaDoDia(parsed.data.data);
  }

  /**
   * S0.x/rename-mapa-forca — Retorna apenas o Fiscal escalado do dia, sem
   * carregar o payload completo. Usado pelo frontend para decidir se o usuário
   * atual pode clicar em "Iniciar Prévia do Mapa Força".
   */
  @Get(':data/fiscal')
  async getFiscalDoDia(@Param('data') data: string): Promise<{ fiscal: FiscalDoDia | null }> {
    if (!dataParamRegex.test(data)) {
      throw new BadRequestException('data inválida (esperado YYYY-MM-DD)');
    }
    return { fiscal: await this.mapaForca.getFiscalDoDia(data) };
  }

  /** F7a — Lê os ajustes pré-turno persistidos para uma data. */
  @Get(':data/ajustes')
  getAjustes(@Param('data') data: string): AjustesPrevia {
    if (!dataParamRegex.test(data)) {
      throw new BadRequestException('data inválida (esperado YYYY-MM-DD)');
    }
    return this.ajustes.get(data);
  }

  /**
   * F7a — Substitui completamente os ajustes pré-turno (overwrite atômico).
   *
   * S0.x/rename-mapa-forca: gate granular agora exige estado PREVIA_INICIADA
   * + NF do iniciador (ou admin) — validado dentro do service.
   */
  @Roles('admin', 'fiscal', 'sargenteante')
  @Put(':data/ajustes')
  @HttpCode(HttpStatus.OK)
  upsertAjustes(
    @Param('data') data: string,
    @Body() body: unknown,
    @CurrentUser() user: UserSession,
  ): AjustesPrevia {
    if (!dataParamRegex.test(data)) {
      throw new BadRequestException('data inválida (esperado YYYY-MM-DD)');
    }
    const parsed = upsertAjustesPreviaSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    }
    return this.ajustes.upsert(data, parsed.data, user.nf, user.papeis.includes('admin'));
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
    return this.ajustes.addTrocaEscalaEspecial(
      data,
      parsed.data,
      user.nf,
      user.papeis.includes('admin'),
    );
  }

  /** S6a-fix item 4 — remove uma troca de Escala Especial pelo identificador do ato. */
  @Roles('admin', 'fiscal', 'sargenteante')
  @Delete(':data/ajustes/escala-especial/trocas/:atoKey')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeTrocaEscalaEspecial(
    @Param('data') data: string,
    @Param('atoKey') atoKey: string,
    @CurrentUser() user: UserSession,
  ): void {
    if (!dataParamRegex.test(data)) {
      throw new BadRequestException('data inválida (esperado YYYY-MM-DD)');
    }
    const removed = this.ajustes.removeTrocaEscalaEspecial(
      data,
      decodeURIComponent(atoKey),
      user.nf,
      user.papeis.includes('admin'),
    );
    if (!removed) {
      throw new NotFoundException('Troca de Escala Especial não encontrada para este ato.');
    }
  }
}

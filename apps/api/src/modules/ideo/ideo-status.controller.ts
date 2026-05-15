import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  forwardRef,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Put,
} from '@nestjs/common';
import {
  upsertIdeoStatusInputSchema,
  type IdeoStatusDoDia,
  type TipoIdeo,
  type UserSession,
} from '@argus/shared-types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { MapaForcaService } from '../mapa-forca/mapa-forca.service';
import { IdeoStatusService } from './ideo-status.service';

const dataParamRegex = /^\d{4}-\d{2}-\d{2}$/;

/**
 * S0.x — Identifica se o usuário é Chefe escalado de algum recurso do
 * `tipo` no dia. Para tipo=ABTS, qualquer ABTS_xx serve; para RESGATE,
 * qualquer "Resgate xx".
 */
function recursoCobreTipo(recurso: string, tipo: TipoIdeo): boolean {
  const r = recurso.toUpperCase().replace(/[\s_]/g, '');
  if (tipo === 'ABTS') return r.startsWith('ABTS');
  if (tipo === 'RESGATE') return r.startsWith('RESGATE');
  return false;
}

@Controller('ideo-status')
export class IdeoStatusController {
  constructor(
    private readonly status: IdeoStatusService,
    @Inject(forwardRef(() => MapaForcaService))
    private readonly mapaForca: MapaForcaService,
  ) {}

  @Get(':data')
  getByData(@Param('data') data: string): IdeoStatusDoDia[] {
    if (!dataParamRegex.test(data)) {
      throw new BadRequestException('data inválida (esperado YYYY-MM-DD)');
    }
    return this.status.getByData(data);
  }

  /**
   * S6i + S0.x — Atesta IDEO de um tipo (ABTS/RESGATE) com 4 estados.
   * Permission gate: admin/fiscal/sargenteante override; demais (Chefe)
   * só podem atestar IDEO de tipo cujo recurso ele comanda no dia.
   */
  @Roles('admin', 'fiscal', 'sargenteante', 'chefe_equipe')
  @Put(':data')
  @HttpCode(HttpStatus.OK)
  async upsert(
    @Param('data') data: string,
    @Body() body: unknown,
    @CurrentUser() user: UserSession,
  ): Promise<IdeoStatusDoDia> {
    if (!dataParamRegex.test(data)) {
      throw new BadRequestException('data inválida (esperado YYYY-MM-DD)');
    }
    const parsed = upsertIdeoStatusInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    }
    const isOverride =
      user.papeis.includes('admin') ||
      user.papeis.includes('fiscal') ||
      user.papeis.includes('sargenteante');
    if (!isOverride) {
      const recursosComandados = await this.mapaForca.recursosComandadosPor(user.nf, data);
      const podeAtestar = recursosComandados.some((r) => recursoCobreTipo(r, parsed.data.tipo));
      if (!podeAtestar) {
        throw new ForbiddenException(
          `Você não é Chefe escalado de nenhum recurso ${parsed.data.tipo} neste dia. ` +
            `Apenas o Chefe escalado de ${parsed.data.tipo} 01 ou 02 pode atestar a IDEO ` +
            `(admin/fiscal/sargenteante podem fazer override).`,
        );
      }
    }
    return this.status.upsert(data, parsed.data, user.nf);
  }
}

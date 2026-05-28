import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { efetivoQuerySchema } from '@argus/shared-types';
import { Roles } from '../auth/decorators/roles.decorator';
import { EfetivoService } from './efetivo.service';

@Controller('efetivo')
export class EfetivoController {
  constructor(private readonly efetivo: EfetivoService) {}

  @Get()
  async list(@Query() query: unknown) {
    const parsed = efetivoQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    }
    return this.efetivo.list(parsed.data);
  }

  /**
   * S2.10.13b — Lista de unidades distintas (CG, CEPDEC, DAL, CORREG, DGP,
   * 1ª1º, 2ª1º, etc.) para popular o `<select>` de filtro em
   * /cadastros/efetivo. Ordenadas alfabeticamente.
   */
  @Get('unidades')
  async listUnidades(): Promise<{ unidades: string[] }> {
    const unidades = await this.efetivo.listUnidades();
    return { unidades };
  }

  @Get(':nf')
  async findOne(@Param('nf') nf: string) {
    const militar = await this.efetivo.findByNf(nf);
    if (!militar) {
      throw new NotFoundException(`Militar com NF ${nf} não encontrado no Efetivo`);
    }
    return militar;
  }

  @Roles('admin')
  @Post('sync')
  async forceSync() {
    return this.efetivo.forceSync();
  }
}

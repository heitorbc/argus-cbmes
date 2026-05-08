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

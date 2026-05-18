import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  createCompartimentoMaterialInputSchema,
  registrarConferenciaMaterialInputSchema,
  updateCompartimentoMaterialInputSchema,
  type CompartimentoMaterial,
  type ConferenciaMaterialV2,
  type UserSession,
} from '@argus/shared-types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  CompartimentosMateriaisService,
  ConferenciaMaterialV2Service,
} from './compartimentos-materiais.service';

@Controller('compartimentos-materiais')
export class CompartimentosMateriaisController {
  constructor(private readonly service: CompartimentosMateriaisService) {}

  @Get()
  async list(@Query('contexto') contexto?: string): Promise<CompartimentoMaterial[]> {
    return this.service.list(contexto);
  }

  @Roles('admin')
  @Post()
  async create(@Body() body: unknown): Promise<CompartimentoMaterial> {
    const parsed = createCompartimentoMaterialInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    }
    return this.service.create(parsed.data);
  }

  @Roles('admin')
  @Put(':id')
  async update(@Param('id') id: string, @Body() body: unknown): Promise<CompartimentoMaterial> {
    const parsed = updateCompartimentoMaterialInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    }
    return this.service.update(id, parsed.data);
  }

  @Roles('admin')
  @Delete(':id')
  async softDelete(@Param('id') id: string): Promise<CompartimentoMaterial> {
    return this.service.softDelete(id);
  }
}

@Controller('conferencia-materiais')
export class ConferenciaMaterialV2Controller {
  constructor(private readonly service: ConferenciaMaterialV2Service) {}

  @Get(':data/:contexto')
  async get(
    @Param('data') data: string,
    @Param('contexto') contexto: string,
  ): Promise<ConferenciaMaterialV2 | null> {
    return this.service.getByDataEContexto(data, decodeURIComponent(contexto));
  }

  @Post()
  async registrar(
    @Body() body: unknown,
    @CurrentUser() user: UserSession,
  ): Promise<ConferenciaMaterialV2> {
    const parsed = registrarConferenciaMaterialInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    }
    return this.service.registrar(parsed.data, user.nf);
  }
}

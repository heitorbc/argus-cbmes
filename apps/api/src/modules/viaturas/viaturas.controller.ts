import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { createViaturaSchema, updateViaturaSchema, type ViaturaQdv } from '@argus/shared-types';
import { Roles } from '../auth/decorators/roles.decorator';
import { ViaturasService } from './viaturas.service';
import { ViaturasQdvService } from './viaturas-qdv.service';

@Controller('viaturas')
export class ViaturasController {
  constructor(
    private readonly viaturas: ViaturasService,
    private readonly viaturasQdv: ViaturasQdvService,
  ) {}

  @Get()
  list() {
    return this.viaturas.list();
  }

  /**
   * Item 3 — Lista as viaturas vindas da aba "1BBM_1CIA" da planilha
   * QDV institucional (read-only, cache 5min).
   */
  @Get('qdv')
  async listFromQdv(): Promise<ViaturaQdv[]> {
    return this.viaturasQdv.listAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.viaturas.findById(id);
  }

  @Roles('admin')
  @Post()
  create(@Body() body: unknown) {
    const parsed = createViaturaSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    }
    return this.viaturas.create(parsed.data);
  }

  @Roles('admin')
  @Put(':id')
  update(@Param('id') id: string, @Body() body: unknown) {
    const parsed = updateViaturaSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    }
    return this.viaturas.update(id, parsed.data);
  }

  @Roles('admin')
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  softDelete(@Param('id') id: string) {
    return this.viaturas.softDelete(id);
  }
}

import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { createUnidadeInputSchema, updateUnidadeInputSchema } from '@argus/shared-types';
import { Roles } from '../auth/decorators/roles.decorator';
import { UnidadesService } from './unidades.service';

@Controller('unidades')
export class UnidadesController {
  constructor(private readonly unidades: UnidadesService) {}

  @Get()
  list() {
    return this.unidades.list();
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.unidades.findById(id);
  }

  @Roles('admin')
  @Post()
  create(@Body() body: unknown) {
    const parsed = createUnidadeInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    }
    return this.unidades.create(parsed.data);
  }

  @Roles('admin')
  @Put(':id')
  update(@Param('id') id: string, @Body() body: unknown) {
    const parsed = updateUnidadeInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    }
    return this.unidades.update(id, parsed.data);
  }

  @Roles('admin')
  @Delete(':id')
  softDelete(@Param('id') id: string) {
    return this.unidades.softDelete(id);
  }
}

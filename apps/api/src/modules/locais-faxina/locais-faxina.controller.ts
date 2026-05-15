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
  Query,
} from '@nestjs/common';
import {
  createLocalFaxinaSchema,
  updateLocalFaxinaSchema,
  type LocalFaxina,
} from '@argus/shared-types';
import { Roles } from '../auth/decorators/roles.decorator';
import { LocaisFaxinaService } from './locais-faxina.service';

@Controller('locais-faxina')
export class LocaisFaxinaController {
  constructor(private readonly service: LocaisFaxinaService) {}

  @Get()
  list(@Query('ativosOnly') ativosOnly?: string): LocalFaxina[] {
    return this.service.list({ ativosOnly: ativosOnly === 'true' });
  }

  @Roles('admin')
  @Post()
  create(@Body() body: unknown): LocalFaxina {
    const parsed = createLocalFaxinaSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    return this.service.create(parsed.data);
  }

  @Roles('admin')
  @Put(':id')
  update(@Param('id') id: string, @Body() body: unknown): LocalFaxina {
    const parsed = updateLocalFaxinaSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    return this.service.update(id, parsed.data);
  }

  @Roles('admin')
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  softDelete(@Param('id') id: string): LocalFaxina {
    return this.service.softDelete(id);
  }
}

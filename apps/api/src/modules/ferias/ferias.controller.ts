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
import { z } from 'zod';
import {
  createFeriasInputSchema,
  updateFeriasInputSchema,
  type Ferias,
  type UserSession,
} from '@argus/shared-types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { FeriasService } from './ferias.service';

const listQuerySchema = z.object({
  militarNf: z.string().optional(),
  ano: z
    .string()
    .regex(/^\d{4}$/)
    .optional()
    .transform((s) => (s ? Number(s) : undefined)),
});

@Controller('ferias')
export class FeriasController {
  constructor(private readonly ferias: FeriasService) {}

  @Get()
  list(@Query() query: unknown): Ferias[] {
    const parsed = listQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    }
    return this.ferias.list(parsed.data);
  }

  @Get(':id')
  findById(@Param('id') id: string): Ferias {
    return this.ferias.findById(id);
  }

  @Roles('admin', 'sargenteante')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() body: unknown, @CurrentUser() user: UserSession): Ferias {
    const parsed = createFeriasInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    }
    return this.ferias.createOrConflict(parsed.data, user.nf);
  }

  @Roles('admin', 'sargenteante')
  @Put(':id')
  update(@Param('id') id: string, @Body() body: unknown): Ferias {
    const parsed = updateFeriasInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    }
    return this.ferias.update(id, parsed.data);
  }

  @Roles('admin', 'sargenteante')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): void {
    this.ferias.remove(id);
  }
}

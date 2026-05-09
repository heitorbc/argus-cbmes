import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  TIPO_IDEO,
  markIdeoChecklistInputSchema,
  upsertIdeoEntryInputSchema,
  type TipoIdeo,
} from '@argus/shared-types';
import { z } from 'zod';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { UserSession } from '@argus/shared-types';
import { IdeoChecklistService } from './ideo-checklist.service';
import { IdeoService } from './ideo.service';

@Controller('ideo')
export class IdeoController {
  constructor(
    private readonly ideo: IdeoService,
    private readonly checklist: IdeoChecklistService,
  ) {}

  // Checklist (S5/F6c) — vem antes para não casar com a rota :dia/:tipo
  @Get('checklist')
  listChecklist(@Query() query: unknown) {
    const schema = z.object({ data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
    const parsed = schema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    }
    return this.checklist.list(parsed.data.data);
  }

  @Post('checklist')
  @HttpCode(HttpStatus.OK)
  markChecklist(@Body() body: unknown, @CurrentUser() user: UserSession) {
    const parsed = markIdeoChecklistInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    }
    return this.checklist.mark(parsed.data, user.nf);
  }

  @Get()
  list() {
    return this.ideo.list();
  }

  @Get(':dia/:tipo')
  get(@Param('dia', ParseIntPipe) dia: number, @Param('tipo') tipo: string) {
    const t = tipo.toUpperCase() as TipoIdeo;
    if (!TIPO_IDEO.includes(t)) {
      throw new BadRequestException(`Tipo inválido — use ${TIPO_IDEO.join(' ou ')}`);
    }
    return { entry: this.ideo.get(dia, t) };
  }

  @Roles('admin')
  @Post()
  @HttpCode(HttpStatus.OK)
  upsert(@Body() body: unknown, @CurrentUser() user: UserSession) {
    const parsed = upsertIdeoEntryInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    }
    return this.ideo.upsert(parsed.data, user.nf);
  }

  @Roles('admin')
  @Delete(':dia/:tipo')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('dia', ParseIntPipe) dia: number, @Param('tipo') tipo: string) {
    const t = tipo.toUpperCase() as TipoIdeo;
    if (!TIPO_IDEO.includes(t)) {
      throw new BadRequestException(`Tipo inválido — use ${TIPO_IDEO.join(' ou ')}`);
    }
    this.ideo.delete(dia, t);
  }
}

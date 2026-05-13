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
  createDispensaInputSchema,
  updateDispensaInputSchema,
  type Dispensa,
  type DispensaSaldoMilitar,
  type DispensaSheet,
  type UserSession,
} from '@argus/shared-types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { DispensasService } from './dispensas.service';
import { DispensasSheetService } from './dispensas-sheet.service';

const listQuerySchema = z.object({
  militarNf: z.string().optional(),
  ano: z
    .string()
    .regex(/^\d{4}$/)
    .optional()
    .transform((s) => (s ? Number(s) : undefined)),
});

@Controller('dispensas')
export class DispensasController {
  constructor(
    private readonly dispensas: DispensasService,
    private readonly dispensasSheet: DispensasSheetService,
  ) {}

  /**
   * Item 2 — Lista as dispensas vindas da aba "Dispensas 2026" da
   * planilha "Efetivo - Dados Gerais" (read-only, cache 5min).
   */
  @Get('sheet')
  async listFromSheet(): Promise<DispensaSheet[]> {
    return this.dispensasSheet.listAll();
  }

  @Get()
  list(@Query() query: unknown): Dispensa[] {
    const parsed = listQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    }
    return this.dispensas.list(parsed.data);
  }

  @Get('saldo/:militarNf/:ano')
  saldo(@Param('militarNf') militarNf: string, @Param('ano') ano: string): DispensaSaldoMilitar {
    if (!/^\d{4}$/.test(ano)) {
      throw new BadRequestException('ano inválido (esperado YYYY)');
    }
    return this.dispensas.saldoMilitar(militarNf, Number(ano));
  }

  @Get(':id')
  findById(@Param('id') id: string): Dispensa {
    return this.dispensas.findById(id);
  }

  @Roles('admin', 'sargenteante', 'fiscal')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() body: unknown, @CurrentUser() user: UserSession): Dispensa {
    const parsed = createDispensaInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    }
    return this.dispensas.createOrConflict(parsed.data, user.nf);
  }

  @Roles('admin', 'sargenteante')
  @Put(':id')
  update(@Param('id') id: string, @Body() body: unknown): Dispensa {
    const parsed = updateDispensaInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    }
    return this.dispensas.update(id, parsed.data);
  }

  @Roles('admin', 'sargenteante')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): void {
    this.dispensas.remove(id);
  }
}

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
import { EfetivoService } from '../efetivo/efetivo.service';
import { parseMilitarCell } from '../escalas/escala-xlsx-parser';
import { NomeMatcher } from '../mapa-forca/nome-matching';
import { DispensasImportService, type SyncResult } from './dispensas-import.service';
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
    private readonly dispensasImport: DispensasImportService,
    private readonly efetivo: EfetivoService,
  ) {}

  /**
   * Item 2 — Lista as dispensas vindas da aba "Dispensas 2026" da
   * planilha "Efetivo - Dados Gerais" (read-only, cache 5min).
   *
   * Reconciliação raw→NF: cruza `militarRaw` com efetivo consolidado
   * via `NomeMatcher`. Quando resolve, preenche `nf`; senão deixa
   * `undefined` (frontend exibe só raw).
   */
  @Get('sheet')
  async listFromSheet(): Promise<DispensaSheet[]> {
    const [items, efetivoTotal] = await Promise.all([
      this.dispensasSheet.listAll(),
      this.efetivo.getAll({ somente1aCia: false, incluirEfetivoOrfao: true }),
    ]);
    const matcher = new NomeMatcher(efetivoTotal);
    return items.map((d) => {
      const ref = parseMilitarCell(d.militarRaw);
      const resolved = ref ? matcher.resolve(ref).resolved : null;
      return { ...d, nf: resolved?.nf };
    });
  }

  @Get()
  async list(@Query() query: unknown): Promise<Dispensa[]> {
    const parsed = listQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    }
    return this.dispensas.list(parsed.data);
  }

  @Get('saldo/:militarNf/:ano')
  async saldo(
    @Param('militarNf') militarNf: string,
    @Param('ano') ano: string,
  ): Promise<DispensaSaldoMilitar> {
    if (!/^\d{4}$/.test(ano)) {
      throw new BadRequestException('ano inválido (esperado YYYY)');
    }
    return this.dispensas.saldoMilitar(militarNf, Number(ano));
  }

  @Get(':id')
  async findById(@Param('id') id: string): Promise<Dispensa> {
    return this.dispensas.findById(id);
  }

  @Roles('admin', 'sargenteante', 'fiscal')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() body: unknown, @CurrentUser() user: UserSession): Promise<Dispensa> {
    const parsed = createDispensaInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    }
    return this.dispensas.createOrConflict(parsed.data, user.nf);
  }

  @Roles('admin', 'sargenteante')
  @Put(':id')
  async update(@Param('id') id: string, @Body() body: unknown): Promise<Dispensa> {
    const parsed = updateDispensaInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    }
    return this.dispensas.update(id, parsed.data);
  }

  @Roles('admin', 'sargenteante')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string): Promise<void> {
    await this.dispensas.remove(id);
  }

  /**
   * S2.10.7d — Força sync imediato com a planilha "Dispensas 2026".
   * Admin only. Retorna counts (created, updated, skipped) + lista de
   * inconsistências (NFs não resolvidas, etc.).
   */
  @Roles('admin', 'sargenteante')
  @Post('sync-planilha')
  @HttpCode(HttpStatus.OK)
  async syncPlanilha(): Promise<SyncResult> {
    return this.dispensasImport.forceSync();
  }
}

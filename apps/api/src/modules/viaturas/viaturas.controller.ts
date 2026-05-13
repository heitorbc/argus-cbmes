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
import {
  createViaturaSchema,
  updateViaturaSchema,
  type ContatoLogistico,
  type ViaturaCbmes,
  type ViaturaQdv,
  type ViaturaQdvBaseLista,
} from '@argus/shared-types';
import { Roles } from '../auth/decorators/roles.decorator';
import { ViaturasService } from './viaturas.service';
import { ViaturasQdvService } from './viaturas-qdv.service';
import { ViaturasQdvExtrasService } from './viaturas-qdv-extras.service';

@Controller('viaturas')
export class ViaturasController {
  constructor(
    private readonly viaturas: ViaturasService,
    private readonly viaturasQdv: ViaturasQdvService,
    private readonly viaturasQdvExtras: ViaturasQdvExtrasService,
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

  /** S0.5/3.1 — Aba `BASE_LISTA` (cadastro mestre detalhado por OBM). */
  @Get('qdv/base-lista')
  async listQdvBaseLista(): Promise<ViaturaQdvBaseLista[]> {
    return this.viaturasQdvExtras.listBaseLista();
  }

  /** S0.5/3.1 — Aba `BASE_VTR_LISTA_PRINCIPAL` (TODAS as VTRs do CBMES). */
  @Get('qdv/cbmes')
  async listVtrCbmes(): Promise<ViaturaCbmes[]> {
    return this.viaturasQdvExtras.listVtrPrincipal();
  }

  /** S0.5/3.1 — Aba `Contatos_LOGISTICAS` (responsável logístico por OBM). */
  @Get('qdv/contatos')
  async listContatosLogisticos(): Promise<ContatoLogistico[]> {
    return this.viaturasQdvExtras.listContatosLogisticas();
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

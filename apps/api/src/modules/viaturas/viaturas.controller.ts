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
  type UserSession,
  type ViaturaCbmes,
  type ViaturaDetalhe,
  type ViaturaEnriquecida,
  type ViaturaQdv,
  type ViaturaQdvBaseLista,
} from '@argus/shared-types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ViaturasService } from './viaturas.service';
import { ViaturasQdvService } from './viaturas-qdv.service';
import { ViaturasQdvExtrasService } from './viaturas-qdv-extras.service';
import { ViaturasEnriquecidasService } from './viaturas-enriquecidas.service';

@Controller('viaturas')
export class ViaturasController {
  constructor(
    private readonly viaturas: ViaturasService,
    private readonly viaturasQdv: ViaturasQdvService,
    private readonly viaturasQdvExtras: ViaturasQdvExtrasService,
    private readonly viaturasEnriquecidas: ViaturasEnriquecidasService,
  ) {}

  /**
   * S0.x — Visão consolidada para `/cadastros/viaturas`. Lista de
   * viaturas da unidade 1BBM_1CIA (vinda da QDV) enriquecida com
   * BASE_LISTA + Mapa Força.
   */
  @Get('enriquecidas')
  async listEnriquecidas(): Promise<{
    items: ViaturaEnriquecida[];
    contatoResponsavel: ContatoLogistico | null;
  }> {
    const [items, contatoResponsavel] = await Promise.all([
      this.viaturasEnriquecidas.listEnriquecidas(),
      this.viaturasEnriquecidas.getContatoResponsavel1aCia(),
    ]);
    return { items, contatoResponsavel };
  }

  /**
   * S0.x — Detalhe consolidado por prefixo, consumido por
   * `/cadastros/viaturas/:prefixo`. Combina QDV (read-only) + override
   * interno (editável) + contato logístico da unidade.
   */
  @Get('enriquecidas/:prefixo')
  async getEnriquecidaByPrefixo(@Param('prefixo') prefixo: string): Promise<ViaturaDetalhe> {
    return this.viaturasEnriquecidas.getDetalhe(prefixo);
  }

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

  /**
   * S0.x — Upsert por prefixo (tela de detalhe `/cadastros/viaturas/:prefixo`).
   * Cria override inicial se a viatura QDV ainda não tem registro interno.
   * Deve vir antes da rota `:id` para evitar colisão de matching.
   */
  @Roles('admin')
  @Put('by-prefixo/:prefixo')
  upsertByPrefixo(
    @Param('prefixo') prefixo: string,
    @Body() body: unknown,
    @CurrentUser() user: UserSession,
  ) {
    const parsed = updateViaturaSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    }
    return this.viaturas.upsertByPrefixo(prefixo, parsed.data, user.nf);
  }

  @Roles('admin')
  @Put(':id')
  update(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: UserSession) {
    const parsed = updateViaturaSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    }
    return this.viaturas.update(id, parsed.data, user.nf);
  }

  @Roles('admin')
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  softDelete(@Param('id') id: string) {
    return this.viaturas.softDelete(id);
  }
}

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import {
  addAlteracaoDiversaSchema,
  type AlteracaoDiversa,
  type ServicoEstado,
  type UserSession,
} from '@argus/shared-types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { MapaForcaService } from '../mapa-forca/mapa-forca.service';
import { ServicoService } from './servico.service';

const dataParamRegex = /^\d{4}-\d{2}-\d{2}$/;

@Controller('servico')
export class ServicoController {
  constructor(
    private readonly servico: ServicoService,
    private readonly mapaForca: MapaForcaService,
  ) {}

  @Get(':data')
  get(@Param('data') data: string): ServicoEstado {
    if (!dataParamRegex.test(data)) {
      throw new BadRequestException('data inválida (esperado YYYY-MM-DD)');
    }
    return this.servico.get(data);
  }

  /**
   * S0.x/rename-mapa-forca — Fiscal escalado (ou admin) inicia a Prévia
   * do Mapa Força para edição. Permission gate por NF é feita no service.
   */
  @Roles('admin', 'fiscal', 'sargenteante')
  @Post(':data/iniciar-previa')
  @HttpCode(HttpStatus.OK)
  async iniciarPrevia(
    @Param('data') data: string,
    @CurrentUser() user: UserSession,
  ): Promise<ServicoEstado> {
    if (!dataParamRegex.test(data)) {
      throw new BadRequestException('data inválida (esperado YYYY-MM-DD)');
    }
    const fiscal = await this.mapaForca.getFiscalDoDia(data);
    const isAdmin = user.papeis.includes('admin');
    return this.servico.iniciarPrevia(data, user.nf, fiscal?.militarNf ?? null, isAdmin);
  }

  /**
   * S0.x/rename-mapa-forca — Cancela a Prévia em edição, voltando o estado
   * para NAO_INICIADO. Apenas quem iniciou ou admin podem cancelar.
   */
  @Roles('admin', 'fiscal', 'sargenteante')
  @Post(':data/cancelar-previa')
  @HttpCode(HttpStatus.OK)
  cancelarPrevia(
    @Param('data') data: string,
    @CurrentUser() user: UserSession,
  ): ServicoEstado {
    if (!dataParamRegex.test(data)) {
      throw new BadRequestException('data inválida (esperado YYYY-MM-DD)');
    }
    const isAdmin = user.papeis.includes('admin');
    return this.servico.cancelarPrevia(data, user.nf, isAdmin);
  }

  @Roles('admin', 'fiscal', 'sargenteante')
  @Post(':data/iniciar')
  @HttpCode(HttpStatus.OK)
  iniciar(@Param('data') data: string, @CurrentUser() user: UserSession): ServicoEstado {
    if (!dataParamRegex.test(data)) {
      throw new BadRequestException('data inválida (esperado YYYY-MM-DD)');
    }
    return this.servico.iniciar(data, user.nf);
  }

  /**
   * S0.x — Encerramento manual restrito a admin (override administrativo).
   * O fluxo institucional normal é a auto-finalização ao iniciar o serviço
   * do dia seguinte (passagem de serviço).
   */
  @Roles('admin')
  @Post(':data/encerrar')
  @HttpCode(HttpStatus.OK)
  encerrar(@Param('data') data: string, @CurrentUser() user: UserSession): ServicoEstado {
    if (!dataParamRegex.test(data)) {
      throw new BadRequestException('data inválida (esperado YYYY-MM-DD)');
    }
    return this.servico.encerrar(data, user.nf, true);
  }

  /**
   * S6h/2.1 + S0.x — Mock do "Preencher Mapa Força CIODES". Transiciona o
   * estado para PREENCHENDO_MF, grava `mfPreenchidoEm` e zera dirty. A
   * escrita real chega no S9 (OAuth/Puppeteer).
   */
  @Roles('admin', 'fiscal', 'sargenteante')
  @Post(':data/preencher-mf')
  @HttpCode(HttpStatus.OK)
  preencherMf(@Param('data') data: string): { estado: ServicoEstado; mensagem: string } {
    if (!dataParamRegex.test(data)) {
      throw new BadRequestException('data inválida (esperado YYYY-MM-DD)');
    }
    const estado = this.servico.marcarPreenchimentoMfIniciado(data);
    return {
      estado,
      mensagem: 'Preenchimento ainda em implementação (mock). A escrita automatizada chega no S9.',
    };
  }

  /**
   * S0.x — Mock do "Atualizar Mapa Força CIODES" (botão dirty-state).
   * Equivale a "preencher de novo": limpa dirty e atualiza timestamp.
   * Exige estado PREENCHENDO_MF (já preenchido antes).
   */
  @Roles('admin', 'fiscal', 'sargenteante')
  @Post(':data/atualizar-mf')
  @HttpCode(HttpStatus.OK)
  atualizarMf(@Param('data') data: string): { estado: ServicoEstado; mensagem: string } {
    if (!dataParamRegex.test(data)) {
      throw new BadRequestException('data inválida (esperado YYYY-MM-DD)');
    }
    const estado = this.servico.atualizarMfMock(data);
    return {
      estado,
      mensagem: 'Preenchimento ainda em implementação (mock). A escrita automatizada chega no S9.',
    };
  }

  // ── Alterações Diversas (S6b/F6) ────────────────────────────────────────

  @Get(':data/alteracoes')
  listAlteracoes(@Param('data') data: string): AlteracaoDiversa[] {
    if (!dataParamRegex.test(data)) {
      throw new BadRequestException('data inválida (esperado YYYY-MM-DD)');
    }
    return this.servico.listAlteracoes(data);
  }

  @Roles('admin', 'fiscal', 'sargenteante')
  @Post(':data/alteracoes')
  @HttpCode(HttpStatus.CREATED)
  addAlteracao(
    @Param('data') data: string,
    @Body() body: unknown,
    @CurrentUser() user: UserSession,
  ): AlteracaoDiversa {
    if (!dataParamRegex.test(data)) {
      throw new BadRequestException('data inválida (esperado YYYY-MM-DD)');
    }
    const parsed = addAlteracaoDiversaSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors.map((e) => e.message));
    }
    return this.servico.addAlteracao(data, parsed.data, user.nf);
  }
}

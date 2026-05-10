import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  addAlteracaoDiversaSchema,
  type AlteracaoDiversa,
  type ServicoEstado,
  type UserSession,
} from '@argus/shared-types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ServicoService } from './servico.service';

const dataParamRegex = /^\d{4}-\d{2}-\d{2}$/;

@Controller('servico')
export class ServicoController {
  constructor(private readonly servico: ServicoService) {}

  @Get(':data')
  get(@Param('data') data: string): ServicoEstado {
    if (!dataParamRegex.test(data)) {
      throw new BadRequestException('data inválida (esperado YYYY-MM-DD)');
    }
    return this.servico.get(data);
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

  @Roles('admin', 'fiscal', 'sargenteante')
  @Post(':data/encerrar')
  @HttpCode(HttpStatus.OK)
  encerrar(
    @Param('data') data: string,
    @Query('force') force: string | undefined,
    @CurrentUser() user: UserSession,
  ): ServicoEstado {
    if (!dataParamRegex.test(data)) {
      throw new BadRequestException('data inválida (esperado YYYY-MM-DD)');
    }
    const isAdmin = user.papeis.includes('admin') || user.papeis.includes('sargenteante');
    return this.servico.encerrar(data, user.nf, isAdmin && force === 'true');
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

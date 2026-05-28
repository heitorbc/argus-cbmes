import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { UserSession } from '@argus/shared-types';
import { AgendaService } from './agenda.service';
import type { AgendaResponse } from '@argus/shared-types';

@Controller('agenda')
export class AgendaController {
  constructor(private readonly svc: AgendaService) {}

  /**
   * Próxima escala do militar logado + janela rolante. Por padrão olha
   * para os próximos 30 dias a partir de hoje.
   */
  @Get()
  async proxima(
    @CurrentUser() user: UserSession,
    @Query('dias') diasParam?: string,
  ): Promise<AgendaResponse> {
    const dias = parsePositiveInt(diasParam, 30, 90);
    const hoje = new Date();
    const fim = new Date(hoje);
    fim.setUTCDate(fim.getUTCDate() + dias);
    return this.svc.forMilitar(user.nf, toIso(hoje), toIso(fim), user.nome);
  }

  /**
   * Range arbitrário — usado pela view de calendário do frontend
   * (visualizar mês corrente, próximo, etc). Range máximo 90 dias.
   */
  @Get('range')
  async range(
    @CurrentUser() user: UserSession,
    @Query('inicio') inicio: string,
    @Query('fim') fim: string,
  ): Promise<AgendaResponse> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio ?? '')) {
      throw new BadRequestException('inicio inválido (esperado YYYY-MM-DD)');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fim ?? '')) {
      throw new BadRequestException('fim inválido (esperado YYYY-MM-DD)');
    }
    const start = new Date(`${inicio}T00:00:00Z`);
    const end = new Date(`${fim}T00:00:00Z`);
    if (end < start) {
      throw new BadRequestException('fim < inicio');
    }
    const dias = Math.round((end.getTime() - start.getTime()) / 86_400_000);
    if (dias > 90) {
      throw new BadRequestException('range > 90 dias');
    }
    return this.svc.forMilitar(user.nf, inicio, fim, user.nome);
  }

  /**
   * S2.10.15 — Endpoint diagnostic (admin). Recebe `nf` arbitrário e `dias`
   * (default 30, máx 90) e retorna a agenda + contagens passo-a-passo por
   * fonte + tamanho do efetivo carregado. Usado para investigar reports de
   * militares cujas entries não aparecem ("por que não vejo X na agenda?").
   */
  @Roles('admin')
  @Get('_trace')
  async trace(
    @Query('nf') nf: string,
    @Query('dias') diasParam?: string,
    @Query('nome') nome?: string,
  ): Promise<{
    agenda: AgendaResponse;
    contagensPorFonte: Record<string, number>;
    efetivoSize: number;
  }> {
    if (!nf || !/^\d{6,8}$/.test(nf)) {
      throw new BadRequestException('nf inválido (esperado 6-8 dígitos)');
    }
    const dias = parsePositiveInt(diasParam, 30, 90);
    const hoje = new Date();
    const fim = new Date(hoje);
    fim.setUTCDate(fim.getUTCDate() + dias);
    return this.svc.trace(nf, toIso(hoje), toIso(fim), nome);
  }
}

function parsePositiveInt(raw: string | undefined, def: number, max: number): number {
  if (!raw) return def;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(n, max);
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

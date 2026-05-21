import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import type { ChefeOperacoes } from '@argus/shared-types';
import { ChefesOperacoesService, type ChefeOperacoesHabilitado } from './chefes-operacoes.service';

@Controller('chefes-operacoes')
export class ChefesOperacoesController {
  constructor(private readonly service: ChefesOperacoesService) {}

  /**
   * S0.x/fixes-3 — Lista todos os militares habilitados como Chefe de
   * Operações (planilha externa) enriquecidos com posto/nome via efetivo.
   * Consumido pelo modal de troca de ChOp no Mapa Força + a página
   * /cadastros/chefes-operacoes (S2.10.10b).
   */
  @Get('habilitados')
  async listHabilitados(): Promise<ChefeOperacoesHabilitado[]> {
    return this.service.listHabilitadosEnriquecido();
  }

  /**
   * S2.10.11b — Escala de um mês específico, agrupada por dia.
   *
   * `?ano=2026&mes=5` — quando ausentes, usa o mês corrente (servidor).
   * Tabela `chefe_operacoes_escala` armazena histórico multi-mês (drop em
   * S2.10.11b do schema antigo `@@id([nf, dia])` para `@@id([ano,mes,nf,dia])`).
   */
  @Get('escalados-mes')
  async listEscaladosDoMes(
    @Query('ano') anoRaw?: string,
    @Query('mes') mesRaw?: string,
  ): Promise<{ dia: number; militares: ChefeOperacoes[] }[]> {
    const hoje = new Date();
    const ano = parseQuery(anoRaw, hoje.getFullYear(), 'ano');
    const mes = parseQuery(mesRaw, hoje.getMonth() + 1, 'mes');
    if (mes < 1 || mes > 12) {
      throw new BadRequestException('mes deve estar entre 1 e 12');
    }
    return this.service.listEscaladosDoMes(ano, mes);
  }

  /**
   * S2.10.11b — Meses disponíveis em Postgres (para popular o seletor da UI).
   */
  @Get('meses-disponiveis')
  async listMesesDisponiveis(): Promise<Array<{ ano: number; mes: number }>> {
    return this.service.listMesesDisponiveis();
  }
}

function parseQuery(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined || raw === '') return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) {
    throw new BadRequestException(`${name} inválido: ${raw}`);
  }
  return n;
}

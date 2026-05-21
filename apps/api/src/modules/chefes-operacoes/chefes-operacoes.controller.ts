import { Controller, Get } from '@nestjs/common';
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
   * S2.10.10b — Escala do mês corrente da planilha ChOp, agrupada por dia.
   * Backed por `prisma.chefeOperacoesEscala` (replace-all strategy: só
   * armazena 1 mês de cada vez). Consumido pela página dedicada de ChOp.
   */
  @Get('escalados-mes')
  async listEscaladosDoMes(): Promise<{ dia: number; militares: ChefeOperacoes[] }[]> {
    return this.service.listEscaladosDoMes();
  }
}

import { Controller, Get } from '@nestjs/common';
import {
  ChefesOperacoesService,
  type ChefeOperacoesHabilitado,
} from './chefes-operacoes.service';

@Controller('chefes-operacoes')
export class ChefesOperacoesController {
  constructor(private readonly service: ChefesOperacoesService) {}

  /**
   * S0.x/fixes-3 — Lista todos os militares habilitados como Chefe de
   * Operações (planilha externa) enriquecidos com posto/nome via efetivo.
   * Consumido pelo modal de troca de ChOp no Mapa Força.
   */
  @Get('habilitados')
  async listHabilitados(): Promise<ChefeOperacoesHabilitado[]> {
    return this.service.listHabilitadosEnriquecido();
  }
}

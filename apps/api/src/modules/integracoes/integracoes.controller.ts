import { Controller, Get, Param, Post } from '@nestjs/common';
import type { IntegracaoStatus } from '@argus/shared-types';
import { Roles } from '../auth/decorators/roles.decorator';
import { IntegracoesService } from './integracoes.service';

/**
 * S0.5/PR2 — Lista metadados (read-only) das integrações Google Sheets
 * para a página /configuracoes/integracoes.
 *
 * `GET /integracoes` — read-only, qualquer autenticado.
 * `POST /integracoes/:id/sync` (PR3) — força resync de uma integração.
 *   Apenas `admin` pode disparar (custo: 1 fetch HTTP por planilha + parse).
 */
@Controller('integracoes')
export class IntegracoesController {
  constructor(private readonly svc: IntegracoesService) {}

  @Get()
  list(): IntegracaoStatus[] {
    return this.svc.list();
  }

  @Roles('admin')
  @Post(':id/sync')
  async sync(@Param('id') id: string): Promise<IntegracaoStatus> {
    return this.svc.sync(id);
  }
}

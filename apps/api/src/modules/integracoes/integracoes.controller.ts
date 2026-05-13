import { Controller, Get } from '@nestjs/common';
import type { IntegracaoStatus } from '@argus/shared-types';
import { IntegracoesService } from './integracoes.service';

/**
 * S0.5/PR2 — Lista metadados (read-only) das integrações Google Sheets
 * para a página /configuracoes/integracoes.
 *
 * Sem RBAC restritivo — todos os autenticados leem (somente status, sem
 * dados sensíveis).
 */
@Controller('integracoes')
export class IntegracoesController {
  constructor(private readonly svc: IntegracoesService) {}

  @Get()
  list(): IntegracaoStatus[] {
    return this.svc.list();
  }
}

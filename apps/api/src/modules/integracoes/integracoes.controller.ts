import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import type { IntegracaoStatus, SyncLogEntry } from '@argus/shared-types';
import type { SyncLog } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { SyncOrchestratorService } from '../sync-orchestrator/sync-orchestrator.service';
import { IntegracoesService } from './integracoes.service';

/**
 * S0.5/PR2 + S2.10.8a — Metadados das integrações Google Sheets + histórico
 * de sync + sync manual (single ou all). Visível em `/configuracoes/integracoes`.
 */
@Controller('integracoes')
export class IntegracoesController {
  constructor(
    private readonly svc: IntegracoesService,
    private readonly orchestrator: SyncOrchestratorService,
  ) {}

  @Get()
  list(): IntegracaoStatus[] {
    return this.svc.list();
  }

  @Roles('admin')
  @Post(':id/sync')
  async sync(@Param('id') id: string): Promise<IntegracaoStatus> {
    return this.svc.sync(id);
  }

  /**
   * S2.10.8a — Histórico recente de syncs (auditoria). Quando `fonte` é
   * informado via query, filtra; senão retorna últimos N de todas as fontes.
   */
  @Get('historico')
  async historico(
    @Query('fonte') fonte?: string,
    @Query('limit') limit?: string,
  ): Promise<SyncLogEntry[]> {
    const limitN = limit ? Math.min(Number.parseInt(limit, 10) || 20, 100) : 20;
    const logs = await this.orchestrator.getHistory(fonte, limitN);
    return logs.map(toEntry);
  }

  /**
   * S2.10.8a — Dispara sync de TODAS as sources registradas no orchestrator
   * em paralelo. Retorna logs criados. Admin only.
   */
  @Roles('admin')
  @Post('sync-all')
  @HttpCode(HttpStatus.OK)
  async syncAll(): Promise<SyncLogEntry[]> {
    const logs = await this.orchestrator.syncAll('manual');
    return logs.map(toEntry);
  }
}

function toEntry(log: SyncLog): SyncLogEntry {
  return {
    id: log.id,
    fonte: log.fonte,
    status: log.status as SyncLogEntry['status'],
    created: log.created,
    updated: log.updated,
    skipped: log.skipped,
    erros: log.erros,
    trigger: log.trigger,
    duracaoMs: log.duracaoMs,
    iniciadoEm: log.iniciadoEm.toISOString(),
    finalizadoEm: log.finalizadoEm.toISOString(),
  };
}

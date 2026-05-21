import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import type { ChefeOperacoes } from '@argus/shared-types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EfetivoService } from '../efetivo/efetivo.service';
import { ChefesOperacoesImportService } from './chefes-operacoes-import.service';

/**
 * S0.x/fixes-3 — DTO retornado por `listHabilitadosEnriquecido` para o
 * modal de troca de Chefe de Operações na Prévia. Combina a NF do
 * habilitado (planilha ChOp) com posto/nome vindos do efetivo.
 */
export interface ChefeOperacoesHabilitado {
  nf: string;
  posto: string;
  nomeGuerra: string;
  nome: string;
  telefone?: string;
}

const ESCALADO_MARKERS = new Set(['X', 'Y', 'S', '*']);

/**
 * S2.10.9a — Lê escala de Chefe de Operações de `prisma.chefeOperacoesEscala`.
 * Antes (S0.5 — S2.10.8): cache TTL 5min in-memory com fetch Google em
 * runtime. Agora: cron 00/06/12/18h + startup via `ChefesOperacoesImportService`.
 *
 * `forceSync()` é mantido para o botão "Sincronizar agora" do menu
 * `/configuracoes/integracoes` — delega ao import service.
 */
@Injectable()
export class ChefesOperacoesService {
  private readonly logger = new Logger(ChefesOperacoesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly importSvc: ChefesOperacoesImportService,
    @Inject(forwardRef(() => EfetivoService))
    private readonly efetivo: EfetivoService,
  ) {}

  /**
   * S0.x/fixes-3 — Lista todos os militares habilitados como ChOp,
   * enriquecidos com posto/nome via `EfetivoService`. Usado pelo modal
   * de troca de ChOp no Mapa Força.
   */
  async listHabilitadosEnriquecido(): Promise<ChefeOperacoesHabilitado[]> {
    const habilitados = await this.getHabilitadosNfs();
    if (habilitados.size === 0) return [];
    const efetivoTotal = await this.efetivo.getAll({
      somente1aCia: false,
      incluirEfetivoOrfao: true,
    });
    const enriquecidos: ChefeOperacoesHabilitado[] = [];
    for (const nf of habilitados) {
      const m = efetivoTotal.find((mil) => mil.nf === nf);
      if (m) {
        enriquecidos.push({
          nf: m.nf,
          posto: m.posto,
          nomeGuerra: m.nomeGuerra ?? m.nome.split(' ')[0] ?? m.nome,
          nome: m.nome,
        });
      } else {
        enriquecidos.push({
          nf,
          posto: '',
          nomeGuerra: '(não resolvido)',
          nome: `NF ${nf}`,
        });
      }
    }
    return enriquecidos.sort((a, b) => a.nomeGuerra.localeCompare(b.nomeGuerra));
  }

  async getEscaladosDoDia(_ano: number, _mes: number, dia: number): Promise<ChefeOperacoes[]> {
    try {
      const rows = await this.prisma.chefeOperacoesEscala.findMany({ where: { dia } });
      return rows
        .filter((r) => ESCALADO_MARKERS.has(r.marcador))
        .map((r) => ({
          posto: r.posto,
          nomeGuerra: r.nomeGuerra,
          nf: r.nf,
          telefone: r.telefone ?? undefined,
          marcador: r.marcador,
        }));
    } catch (err) {
      this.logger.warn(
        `getEscaladosDoDia falhou: ${(err as Error).message}. Retornando lista vazia.`,
      );
      return [];
    }
  }

  /**
   * S2.10.10b — Escala completa do mês corrente armazenado em Postgres.
   *
   * Como a planilha de ChOp usa replace-all e só armazena 1 mês de cada vez,
   * não há parâmetro de ano/mes — sempre retorna o mês atualmente em
   * `prisma.chefeOperacoesEscala`. Frontend mostra como "Escala do mês corrente".
   */
  async listEscaladosDoMes(): Promise<{ dia: number; militares: ChefeOperacoes[] }[]> {
    try {
      const rows = await this.prisma.chefeOperacoesEscala.findMany({
        orderBy: [{ dia: 'asc' }, { posto: 'asc' }, { nomeGuerra: 'asc' }],
      });
      const porDia = new Map<number, ChefeOperacoes[]>();
      for (const r of rows) {
        if (!ESCALADO_MARKERS.has(r.marcador)) continue;
        const arr = porDia.get(r.dia) ?? [];
        arr.push({
          posto: r.posto,
          nomeGuerra: r.nomeGuerra,
          nf: r.nf,
          telefone: r.telefone ?? undefined,
          marcador: r.marcador,
        });
        porDia.set(r.dia, arr);
      }
      return Array.from(porDia.entries())
        .sort(([a], [b]) => a - b)
        .map(([dia, militares]) => ({ dia, militares }));
    } catch (err) {
      this.logger.warn(
        `listEscaladosDoMes falhou: ${(err as Error).message}. Retornando lista vazia.`,
      );
      return [];
    }
  }

  /**
   * Conjunto de NFs habilitados a ser Chefe de Operações (todos militares
   * na escala, escalados ou não). Usado para validar trocas autorizadas
   * cuja função envolve ChOp — substituto deve estar habilitado.
   */
  async getHabilitadosNfs(): Promise<Set<string>> {
    try {
      const rows = await this.prisma.chefeOperacoesEscala.findMany({
        distinct: ['nf'],
        select: { nf: true },
      });
      return new Set(rows.map((r) => r.nf));
    } catch (err) {
      this.logger.warn(
        `getHabilitadosNfs falhou: ${(err as Error).message}. Retornando set vazio.`,
      );
      return new Set();
    }
  }

  /** S2.10.9a — Status delegado ao import service (counts em Postgres). */
  getSyncStatus(): { syncedAt: string | null; count: number; stale: boolean } {
    const s = this.importSvc.getSyncStatus();
    return {
      syncedAt: s.syncedAt,
      count: s.counts ? s.counts.created : 0,
      stale: s.stale,
    };
  }

  /** S2.10.9a — Força resync (admin via /configuracoes/integracoes). */
  async forceSync(): Promise<{ syncedAt: string; count: number }> {
    const r = await this.importSvc.forceSync();
    return { syncedAt: r.syncedAt, count: r.created };
  }
}

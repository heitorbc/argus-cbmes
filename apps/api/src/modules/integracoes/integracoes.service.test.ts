import { describe, it, expect, beforeEach } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { IntegracoesService } from './integracoes.service';
import { ChefesOperacoesService } from '../chefes-operacoes/chefes-operacoes.service';
import { DispensasSheetService } from '../dispensas/dispensas-sheet.service';
import { TrocasAutorizadasService } from '../trocas-autorizadas/trocas-autorizadas.service';
import { ViaturasQdvService } from '../viaturas/viaturas-qdv.service';

type SyncStatus = { syncedAt: string | null; count: number; stale: boolean };

function makeFakeService(status: SyncStatus): { getSyncStatus: () => SyncStatus } {
  return { getSyncStatus: () => status };
}

describe('IntegracoesService', () => {
  let svc: IntegracoesService;
  let trocasAut: { getSyncStatus: () => SyncStatus };
  let chefesOp: { getSyncStatus: () => SyncStatus };
  let dispensasSheet: { getSyncStatus: () => SyncStatus };
  let viaturasQdv: { getSyncStatus: () => SyncStatus };

  beforeEach(() => {
    trocasAut = makeFakeService({ syncedAt: null, count: 0, stale: false });
    chefesOp = makeFakeService({ syncedAt: null, count: 0, stale: false });
    dispensasSheet = makeFakeService({ syncedAt: null, count: 0, stale: false });
    viaturasQdv = makeFakeService({ syncedAt: null, count: 0, stale: false });

    const config = new ConfigService({});
    svc = new IntegracoesService(
      config,
      trocasAut as unknown as TrocasAutorizadasService,
      chefesOp as unknown as ChefesOperacoesService,
      dispensasSheet as unknown as DispensasSheetService,
      viaturasQdv as unknown as ViaturasQdvService,
    );
  });

  it('lista as 4 integrações cadastradas', () => {
    const result = svc.list();
    expect(result).toHaveLength(4);
    expect(result.map((r) => r.id).sort()).toEqual([
      'chefes-operacoes',
      'dispensas-sheet',
      'trocas-autorizadas',
      'viaturas-qdv',
    ]);
  });

  it('mapeia status "nunca" quando o cache ainda está vazio', () => {
    const result = svc.list();
    for (const item of result) {
      expect(item.status).toBe('nunca');
      expect(item.ultimoSyncEm).toBeNull();
      expect(item.qtdRegistros).toBe(0);
    }
  });

  it('mapeia status "ok" quando há cache fresco e "stale" quando expirado', () => {
    trocasAut.getSyncStatus = () => ({
      syncedAt: '2026-05-13T12:00:00.000Z',
      count: 42,
      stale: false,
    });
    chefesOp.getSyncStatus = () => ({
      syncedAt: '2026-05-13T08:00:00.000Z',
      count: 30,
      stale: true,
    });

    const result = svc.list();
    const trocas = result.find((r) => r.id === 'trocas-autorizadas');
    const chefes = result.find((r) => r.id === 'chefes-operacoes');

    expect(trocas?.status).toBe('ok');
    expect(trocas?.qtdRegistros).toBe(42);
    expect(trocas?.ultimoSyncEm).toBe('2026-05-13T12:00:00.000Z');

    expect(chefes?.status).toBe('stale');
    expect(chefes?.qtdRegistros).toBe(30);
  });

  it('gera URL pública apontando para a planilha + aba correta', () => {
    const result = svc.list();
    const trocas = result.find((r) => r.id === 'trocas-autorizadas');
    expect(trocas?.url).toContain('docs.google.com/spreadsheets/d/');
    expect(trocas?.url).toContain('gid=1799360305');

    const dispensas = result.find((r) => r.id === 'dispensas-sheet');
    expect(dispensas?.url).toContain('Dispensas%202026');
  });
});

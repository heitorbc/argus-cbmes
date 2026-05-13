import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntegracoesService } from './integracoes.service';
import { ChefesOperacoesService } from '../chefes-operacoes/chefes-operacoes.service';
import { DispensasSheetService } from '../dispensas/dispensas-sheet.service';
import { TrocasAutorizadasService } from '../trocas-autorizadas/trocas-autorizadas.service';
import { ViaturasQdvService } from '../viaturas/viaturas-qdv.service';
import { ViaturasQdvExtrasService } from '../viaturas/viaturas-qdv-extras.service';

type SyncStatus = { syncedAt: string | null; count: number; stale: boolean };

interface FakeSheetService {
  status: SyncStatus;
  getSyncStatus: () => SyncStatus;
  forceSync: ReturnType<typeof vi.fn>;
}

function makeFakeService(status: SyncStatus): FakeSheetService {
  const fake: FakeSheetService = {
    status,
    getSyncStatus: () => fake.status,
    forceSync: vi.fn(async () => {
      fake.status = { syncedAt: '2026-05-13T12:00:00.000Z', count: 99, stale: false };
      return { syncedAt: fake.status.syncedAt!, count: fake.status.count };
    }),
  };
  return fake;
}

interface FakeExtrasService {
  baseLista: FakeSheetService;
  vtrPrincipal: FakeSheetService;
  contatos: FakeSheetService;
  getSyncStatusBaseLista: () => SyncStatus;
  getSyncStatusVtrPrincipal: () => SyncStatus;
  getSyncStatusContatos: () => SyncStatus;
  forceSyncBaseLista: ReturnType<typeof vi.fn>;
  forceSyncVtrPrincipal: ReturnType<typeof vi.fn>;
  forceSyncContatos: ReturnType<typeof vi.fn>;
}

function makeFakeExtras(): FakeExtrasService {
  const baseLista = makeFakeService({ syncedAt: null, count: 0, stale: false });
  const vtrPrincipal = makeFakeService({ syncedAt: null, count: 0, stale: false });
  const contatos = makeFakeService({ syncedAt: null, count: 0, stale: false });
  return {
    baseLista,
    vtrPrincipal,
    contatos,
    getSyncStatusBaseLista: () => baseLista.status,
    getSyncStatusVtrPrincipal: () => vtrPrincipal.status,
    getSyncStatusContatos: () => contatos.status,
    forceSyncBaseLista: baseLista.forceSync,
    forceSyncVtrPrincipal: vtrPrincipal.forceSync,
    forceSyncContatos: contatos.forceSync,
  };
}

describe('IntegracoesService', () => {
  let svc: IntegracoesService;
  let trocasAut: FakeSheetService;
  let chefesOp: FakeSheetService;
  let dispensasSheet: FakeSheetService;
  let viaturasQdv: FakeSheetService;
  let viaturasQdvExtras: FakeExtrasService;

  beforeEach(() => {
    trocasAut = makeFakeService({ syncedAt: null, count: 0, stale: false });
    chefesOp = makeFakeService({ syncedAt: null, count: 0, stale: false });
    dispensasSheet = makeFakeService({ syncedAt: null, count: 0, stale: false });
    viaturasQdv = makeFakeService({ syncedAt: null, count: 0, stale: false });
    viaturasQdvExtras = makeFakeExtras();

    const config = new ConfigService({});
    svc = new IntegracoesService(
      config,
      trocasAut as unknown as TrocasAutorizadasService,
      chefesOp as unknown as ChefesOperacoesService,
      dispensasSheet as unknown as DispensasSheetService,
      viaturasQdv as unknown as ViaturasQdvService,
      viaturasQdvExtras as unknown as ViaturasQdvExtrasService,
    );
  });

  it('lista as 7 integrações cadastradas (1BBM_1CIA + 3 abas extras)', () => {
    const result = svc.list();
    expect(result).toHaveLength(7);
    expect(result.map((r) => r.id).sort()).toEqual([
      'chefes-operacoes',
      'dispensas-sheet',
      'trocas-autorizadas',
      'viaturas-qdv',
      'viaturas-qdv-base-lista',
      'viaturas-qdv-cbmes',
      'viaturas-qdv-contatos',
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
    trocasAut.status = { syncedAt: '2026-05-13T12:00:00.000Z', count: 42, stale: false };
    chefesOp.status = { syncedAt: '2026-05-13T08:00:00.000Z', count: 30, stale: true };

    const result = svc.list();
    const trocas = result.find((r) => r.id === 'trocas-autorizadas');
    const chefes = result.find((r) => r.id === 'chefes-operacoes');

    expect(trocas?.status).toBe('ok');
    expect(trocas?.qtdRegistros).toBe(42);
    expect(trocas?.ultimoSyncEm).toBe('2026-05-13T12:00:00.000Z');

    expect(chefes?.status).toBe('stale');
    expect(chefes?.qtdRegistros).toBe(30);
  });

  describe('sync(id)', () => {
    it('chama forceSync() do service correspondente e retorna o novo status', async () => {
      const result = await svc.sync('trocas-autorizadas');
      expect(trocasAut.forceSync).toHaveBeenCalledTimes(1);
      expect(result.id).toBe('trocas-autorizadas');
      expect(result.status).toBe('ok');
      expect(result.qtdRegistros).toBe(99);
      expect(result.ultimoSyncEm).toBe('2026-05-13T12:00:00.000Z');
    });

    it('não chama os outros services', async () => {
      await svc.sync('chefes-operacoes');
      expect(chefesOp.forceSync).toHaveBeenCalledTimes(1);
      expect(trocasAut.forceSync).not.toHaveBeenCalled();
      expect(dispensasSheet.forceSync).not.toHaveBeenCalled();
      expect(viaturasQdv.forceSync).not.toHaveBeenCalled();
    });

    it('lança NotFoundException para id desconhecido', async () => {
      await expect(svc.sync('inexistente')).rejects.toBeInstanceOf(NotFoundException);
    });
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

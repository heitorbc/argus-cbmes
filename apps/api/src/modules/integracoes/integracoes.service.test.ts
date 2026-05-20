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

/** S2.10.8a — Fakes para os novos services real-time-only adicionados ao menu. */
function makeFakeQdi(): FakeSheetService {
  return makeFakeService({ syncedAt: null, count: 0, stale: false });
}

function makeFakeIseo() {
  let status: SyncStatus = { syncedAt: null, count: 0, stale: false };
  return {
    // S2.10.8c: agora async (Prisma queries)
    getSyncStatusAgregado: async () => status,
    forceSyncAsSource: vi.fn(async () => {
      status = { syncedAt: '2026-05-13T12:00:00.000Z', count: 50, stale: false };
      return { syncedAt: status.syncedAt!, count: status.count };
    }),
  };
}

function makeFakeMfCiodes() {
  let status: SyncStatus = { syncedAt: null, count: 0, stale: false };
  return {
    getSyncStatus: () => status,
    forceSyncAsSource: vi.fn(async () => {
      status = { syncedAt: '2026-05-13T12:00:00.000Z', count: 25, stale: false };
      return { syncedAt: status.syncedAt!, count: status.count };
    }),
  };
}

function makeFakeSheetsDb() {
  return {
    getSyncStatusAsSource: () => ({ syncedAt: null, count: 0, stale: false }),
    forceSyncAsSource: vi.fn(async () => ({
      syncedAt: '2026-05-13T12:00:00.000Z',
      count: 3,
    })),
  };
}

/**
 * S2.10.8d — Fake para os 3 ImportServices que compartilham o
 * MilitarConsolidatorService. Shape igual a `dispensasImport`.
 */
function makeFakeMilitarImport() {
  return {
    getSyncStatus: () => ({
      syncedAt: null as string | null,
      counts: null as { created: number; updated: number; skipped: number } | null,
      stale: false,
      inconsistencias: 0,
    }),
    forceSync: async () => ({
      created: 0,
      updated: 0,
      skipped: 0,
      inconsistencias: [] as string[],
      syncedAt: new Date().toISOString(),
    }),
  };
}

describe('IntegracoesService (S2.10.8d — 16 sources)', () => {
  let svc: IntegracoesService;
  let trocasAut: FakeSheetService;
  let chefesOp: FakeSheetService;
  let dispensasSheet: FakeSheetService;
  let dispensasImport: {
    getSyncStatus: () => {
      syncedAt: string | null;
      counts: { created: number; updated: number; skipped: number } | null;
      stale: boolean;
      inconsistencias: number;
    };
    forceSync: () => Promise<{
      created: number;
      updated: number;
      skipped: number;
      inconsistencias: string[];
      syncedAt: string;
    }>;
  };
  let viaturasQdv: FakeSheetService;
  let viaturasQdvExtras: FakeExtrasService;
  let qdi: FakeSheetService;
  let qdiDados: FakeSheetService;
  let iseo: ReturnType<typeof makeFakeIseo>;
  let mfCiodes: ReturnType<typeof makeFakeMfCiodes>;
  let sheetsDb: ReturnType<typeof makeFakeSheetsDb>;
  let efetivoImport: ReturnType<typeof makeFakeMilitarImport>;
  let qdiImport: ReturnType<typeof makeFakeMilitarImport>;
  let qdiDadosImport: ReturnType<typeof makeFakeMilitarImport>;

  beforeEach(() => {
    trocasAut = makeFakeService({ syncedAt: null, count: 0, stale: false });
    chefesOp = makeFakeService({ syncedAt: null, count: 0, stale: false });
    dispensasSheet = makeFakeService({ syncedAt: null, count: 0, stale: false });
    dispensasImport = {
      getSyncStatus: () => ({ syncedAt: null, counts: null, stale: false, inconsistencias: 0 }),
      forceSync: async () => ({
        created: 0,
        updated: 0,
        skipped: 0,
        inconsistencias: [],
        syncedAt: new Date().toISOString(),
      }),
    };
    viaturasQdv = makeFakeService({ syncedAt: null, count: 0, stale: false });
    viaturasQdvExtras = makeFakeExtras();
    qdi = makeFakeQdi();
    qdiDados = makeFakeQdi();
    iseo = makeFakeIseo();
    mfCiodes = makeFakeMfCiodes();
    sheetsDb = makeFakeSheetsDb();
    efetivoImport = makeFakeMilitarImport();
    qdiImport = makeFakeMilitarImport();
    qdiDadosImport = makeFakeMilitarImport();

    const config = new ConfigService({});
    svc = new IntegracoesService(
      config,
      trocasAut as unknown as TrocasAutorizadasService,
      chefesOp as unknown as ChefesOperacoesService,
      dispensasSheet as unknown as DispensasSheetService,
      dispensasImport as unknown as import('../dispensas/dispensas-import.service').DispensasImportService,
      viaturasQdv as unknown as ViaturasQdvService,
      viaturasQdvExtras as unknown as ViaturasQdvExtrasService,
      qdi as unknown as import('../efetivo/qdi.service').QdiService,
      qdiDados as unknown as import('../efetivo/qdi-dados.service').QdiDadosService,
      mfCiodes as unknown as import('../mapa-forca-ciodes/mapa-forca-ciodes.service').MapaForcaCiodesService,
      iseo as unknown as import('../iseo-hospitais/iseo-hospitais.service').IseoHospitaisService,
      sheetsDb as unknown as import('../sheets-db/sheets-db.service').SheetsDbService,
      efetivoImport as unknown as import('../efetivo/efetivo-import.service').EfetivoImportService,
      qdiImport as unknown as import('../efetivo/qdi-import.service').QdiImportService,
      qdiDadosImport as unknown as import('../efetivo/qdi-dados-import.service').QdiDadosImportService,
    );
  });

  it('S2.10.8d — lista as 16 integrações cadastradas (todas as planilhas mapeadas)', async () => {
    const result = await svc.list();
    expect(result).toHaveLength(16);
    expect(result.map((r) => r.id).sort()).toEqual([
      'chefes-operacoes',
      'dispensas-import',
      'dispensas-sheet',
      'efetivo-import',
      'iseo-hospitais',
      'mapa-forca-ciodes',
      'qdi-1a1o',
      'qdi-dados',
      'qdi-dados-import',
      'qdi-import',
      'sheets-db',
      'trocas-autorizadas',
      'viaturas-qdv',
      'viaturas-qdv-base-lista',
      'viaturas-qdv-cbmes',
      'viaturas-qdv-contatos',
    ]);
  });

  it('S2.10.8d — sources persistidas: 6 (dispensas + trocas + iseo + efetivo + qdi + qdi-dados)', async () => {
    const result = await svc.list();
    const realtime = result.filter((r) => r.realtimeOnly);
    const persisted = result.filter((r) => !r.realtimeOnly);
    expect(persisted.map((p) => p.id).sort()).toEqual([
      'dispensas-import',
      'efetivo-import',
      'iseo-hospitais',
      'qdi-dados-import',
      'qdi-import',
      'trocas-autorizadas',
    ]);
    expect(realtime).toHaveLength(10);
  });

  it('S2.10.8a — MF CIODES está marcado como realtimeOnly + noScheduler (decisão D2)', async () => {
    const mf = (await svc.list()).find((r) => r.id === 'mapa-forca-ciodes');
    expect(mf?.realtimeOnly).toBe(true);
    expect(mf?.noScheduler).toBe(true);
  });

  it('mapeia status "nunca" quando o cache ainda está vazio', async () => {
    const result = await svc.list();
    for (const item of result) {
      expect(item.status).toBe('nunca');
      expect(item.ultimoSyncEm).toBeNull();
      expect(item.qtdRegistros).toBe(0);
    }
  });

  it('mapeia status "ok" quando há cache fresco e "stale" quando expirado', async () => {
    trocasAut.status = { syncedAt: '2026-05-13T12:00:00.000Z', count: 42, stale: false };
    chefesOp.status = { syncedAt: '2026-05-13T08:00:00.000Z', count: 30, stale: true };

    const result = await svc.list();
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

    it('S2.10.8a — sync de iseo-hospitais usa adapter agregador', async () => {
      const result = await svc.sync('iseo-hospitais');
      expect(iseo.forceSyncAsSource).toHaveBeenCalledTimes(1);
      expect(result.qtdRegistros).toBe(50);
    });

    it('S2.10.8a — sync de mapa-forca-ciodes usa adapter', async () => {
      const result = await svc.sync('mapa-forca-ciodes');
      expect(mfCiodes.forceSyncAsSource).toHaveBeenCalledTimes(1);
      expect(result.qtdRegistros).toBe(25);
    });
  });

  it('gera URL pública apontando para a planilha + aba correta', async () => {
    const result = await svc.list();
    const trocas = result.find((r) => r.id === 'trocas-autorizadas');
    expect(trocas?.url).toContain('docs.google.com/spreadsheets/d/');
    expect(trocas?.url).toContain('gid=1799360305');

    const dispensas = result.find((r) => r.id === 'dispensas-sheet');
    expect(dispensas?.url).toContain('Dispensas%202026');
  });

  it('S2.10.8a — URL do MF CIODES aponta para spreadsheet conhecido', async () => {
    const mf = (await svc.list()).find((r) => r.id === 'mapa-forca-ciodes');
    expect(mf?.url).toContain('1EWuQwuPBkihzrNQ4OGo9AIibbdBK-el1KHMHo71BVCc');
    expect(mf?.url).toContain('gid=1468029336');
  });

  it('S2.10.8a — URL do ISEO Hospitais aponta para spreadsheet correto', async () => {
    const iseoStatus = (await svc.list()).find((r) => r.id === 'iseo-hospitais');
    expect(iseoStatus?.url).toContain('1wmFOEsrU219fGMfksoSY5dvQu0UN7HdQ558UUiWRXuw');
  });

  it('S2.10.8c-fix: getStatus de 1 source falhando NÃO derruba lista — retorna status=nunca', async () => {
    // Simula prisma falhando em cold boot (ex: pool exausto, query timeout)
    iseo.getSyncStatusAgregado = async () => {
      throw new Error('prisma.iseoHospitalEntry.count() timeout — Supabase cold boot');
    };
    // list() devia retornar 16 entries; iseo-hospitais aparece como nunca
    const result = await svc.list();
    expect(result).toHaveLength(16);
    const iseoStatus = result.find((r) => r.id === 'iseo-hospitais');
    expect(iseoStatus?.status).toBe('nunca');
    expect(iseoStatus?.ultimoSyncEm).toBeNull();
    expect(iseoStatus?.qtdRegistros).toBe(0);
    // Outras sources continuam funcionando
    const trocas = result.find((r) => r.id === 'trocas-autorizadas');
    expect(trocas?.status).toBe('nunca'); // status original, não 'erro'
  });
});

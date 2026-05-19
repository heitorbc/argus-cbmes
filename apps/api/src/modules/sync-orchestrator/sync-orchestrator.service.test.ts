import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { makeSyncLogPrismaMock } from '../../common/prisma/prisma-test-mock';
import {
  SyncOrchestratorService,
  type SyncSource,
  type SyncSourceResult,
  type SyncSourceStatus,
} from './sync-orchestrator.service';

class FakeSource implements SyncSource {
  forceSync = vi.fn();
  getSyncStatus = vi.fn();
  constructor(
    public readonly id: string,
    public readonly nome: string = id,
    private readonly result: SyncSourceResult | Error = {
      created: 1,
      updated: 0,
      skipped: 0,
      inconsistencias: [],
    },
  ) {
    this.forceSync.mockImplementation(async () => {
      if (this.result instanceof Error) throw this.result;
      return this.result;
    });
    this.getSyncStatus.mockReturnValue({
      syncedAt: null,
      counts: null,
      stale: false,
    } satisfies SyncSourceStatus);
  }
}

describe('SyncOrchestratorService (S2.10.8a)', () => {
  let prisma: ReturnType<typeof makeSyncLogPrismaMock>;

  beforeEach(() => {
    prisma = makeSyncLogPrismaMock();
  });

  it('syncAll: grava 1 SyncLog por source (status=success)', async () => {
    const sources = [new FakeSource('a'), new FakeSource('b')];
    const svc = new SyncOrchestratorService(prisma, sources);
    const logs = await svc.syncAll('manual');
    expect(logs).toHaveLength(2);
    expect(logs[0]?.fonte).toBe('a');
    expect(logs[0]?.status).toBe('success');
    expect(logs[0]?.trigger).toBe('manual');
    expect(logs[0]?.created).toBe(1);
    expect(logs[1]?.fonte).toBe('b');
    expect(sources[0]!.forceSync).toHaveBeenCalledTimes(1);
    expect(sources[1]!.forceSync).toHaveBeenCalledTimes(1);
  });

  it('source que lança erro vira status=failed + erros[0]', async () => {
    const sources = [new FakeSource('boom', 'Boom!', new Error('fetch timeout'))];
    const svc = new SyncOrchestratorService(prisma, sources);
    const logs = await svc.syncAll('cron');
    expect(logs).toHaveLength(1);
    expect(logs[0]?.status).toBe('failed');
    expect(logs[0]?.erros).toContain('fetch timeout');
    expect(logs[0]?.created).toBe(0);
    expect(logs[0]?.trigger).toBe('cron');
  });

  it('source com inconsistências (mas algum criado) vira status=partial', async () => {
    const sources = [
      new FakeSource('parcial', 'Parcial', {
        created: 5,
        updated: 0,
        skipped: 2,
        inconsistencias: ['NF 999 não resolvida'],
      }),
    ];
    const svc = new SyncOrchestratorService(prisma, sources);
    const logs = await svc.syncAll('manual');
    expect(logs[0]?.status).toBe('partial');
    expect(logs[0]?.erros).toContain('NF 999 não resolvida');
  });

  it('source com 0 created/updated + inconsistências vira status=failed', async () => {
    const sources = [
      new FakeSource('zero', 'Zero', {
        created: 0,
        updated: 0,
        skipped: 66,
        inconsistencias: ['Militar X não existe', 'Militar Y não existe'],
      }),
    ];
    const svc = new SyncOrchestratorService(prisma, sources);
    const logs = await svc.syncAll('startup');
    expect(logs[0]?.status).toBe('failed');
    expect(logs[0]?.erros).toHaveLength(2);
  });

  it('syncOne: chama apenas a source com id correspondente', async () => {
    const a = new FakeSource('a');
    const b = new FakeSource('b');
    const svc = new SyncOrchestratorService(prisma, [a, b]);
    const log = await svc.syncOne('b', 'manual');
    expect(log.fonte).toBe('b');
    expect(a.forceSync).not.toHaveBeenCalled();
    expect(b.forceSync).toHaveBeenCalledTimes(1);
  });

  it('syncOne: lança NotFoundException para id desconhecido', async () => {
    const svc = new SyncOrchestratorService(prisma, [new FakeSource('a')]);
    await expect(svc.syncOne('inexistente')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('getHistory: retorna logs ordenados por finalizadoEm DESC', async () => {
    const sources = [new FakeSource('a'), new FakeSource('b')];
    const svc = new SyncOrchestratorService(prisma, sources);
    await svc.syncAll('cron');
    await new Promise((r) => setTimeout(r, 10));
    await svc.syncAll('manual');
    const history = await svc.getHistory();
    expect(history).toHaveLength(4); // 2 sources × 2 syncs
    // Mais recente primeiro
    expect(history[0]?.trigger).toBe('manual');
    expect(history.at(-1)?.trigger).toBe('cron');
  });

  it('getHistory: filtra por fonte quando informado', async () => {
    const svc = new SyncOrchestratorService(prisma, [new FakeSource('a'), new FakeSource('b')]);
    await svc.syncAll('manual');
    const apenasA = await svc.getHistory('a');
    expect(apenasA).toHaveLength(1);
    expect(apenasA[0]?.fonte).toBe('a');
  });

  it('getAllStatuses: retorna [id, nome, status] de cada source', async () => {
    const sources = [new FakeSource('a', 'Alfa'), new FakeSource('b', 'Beta')];
    const svc = new SyncOrchestratorService(prisma, sources);
    const all = svc.getAllStatuses();
    expect(all).toHaveLength(2);
    expect(all[0]).toMatchObject({ id: 'a', nome: 'Alfa' });
    expect(all[1]).toMatchObject({ id: 'b', nome: 'Beta' });
  });

  it('onModuleInit: dispara syncAll (fire-and-forget) e não bloqueia boot', async () => {
    const source = new FakeSource('a');
    const svc = new SyncOrchestratorService(prisma, [source]);
    // onModuleInit retorna sem aguardar o sync interno
    await svc.onModuleInit();
    // Permite o fire-and-forget completar antes de verificar
    await new Promise((r) => setTimeout(r, 50));
    expect(source.forceSync).toHaveBeenCalled();
  });

  it('onModuleInit com 0 sources: log warning, não falha', async () => {
    const svc = new SyncOrchestratorService(prisma, []);
    await expect(svc.onModuleInit()).resolves.toBeUndefined();
  });
});

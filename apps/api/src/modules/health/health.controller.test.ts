import { describe, it, expect, vi } from 'vitest';
import type { MapaForcaSnapshot } from '@argus/shared-types';
import { HealthController } from './health.controller';
import type { MapaForcaCiodesService } from '../mapa-forca-ciodes/mapa-forca-ciodes.service';
import type { PrismaService } from '../../common/prisma/prisma.service';

describe('HealthController.check (legacy)', () => {
  it('retorna status ok com service e timestamp ISO', () => {
    const controller = new HealthController();
    const result = controller.check();
    expect(result.status).toBe('ok');
    expect(result.service).toBe('argus-cbmes-api');
    expect(result.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});

describe('HealthController.status (S2.6 / S2.10.13a)', () => {
  function makeMapaForcaMock(snap: MapaForcaSnapshot | Error): MapaForcaCiodesService {
    return {
      getSnapshot: snap instanceof Error ? () => Promise.reject(snap) : () => Promise.resolve(snap),
    } as unknown as MapaForcaCiodesService;
  }

  /** Mock Prisma cujo $queryRaw resolve com um valor após `delayMs`. */
  function makePrismaMock(behavior: { delayMs?: number; throw?: Error } = {}): PrismaService {
    return {
      $queryRaw: async () => {
        if (behavior.throw) throw behavior.throw;
        if (behavior.delayMs && behavior.delayMs > 0) {
          await new Promise((r) => setTimeout(r, behavior.delayMs));
        }
        return [{ ok: 1 }];
      },
    } as unknown as PrismaService;
  }

  const okSnap: MapaForcaSnapshot = {
    recursos: [],
    syncedAt: '2026-05-16T00:00:00.000Z',
    stale: false,
    fiscalDoDia: null,
  };

  it('retorna ok para todos quando tudo está saudável', async () => {
    const controller = new HealthController(makeMapaForcaMock(okSnap), makePrismaMock());
    const r = await controller.status();
    expect(r.api.estado).toBe('ok');
    expect(r.mapaForcaCiodes.estado).toBe('ok');
    expect(r.supabase.estado).toBe('ok');
    expect(r.geradoEm).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('NÃO contém mais o campo sheetsDb (removido em S2.10.13a)', async () => {
    const controller = new HealthController(makeMapaForcaMock(okSnap), makePrismaMock());
    const r = await controller.status();
    expect((r as unknown as Record<string, unknown>).sheetsDb).toBeUndefined();
  });

  it('Mapa Força degraded quando snapshot stale', async () => {
    const controller = new HealthController(
      makeMapaForcaMock({ ...okSnap, stale: true }),
      makePrismaMock(),
    );
    const r = await controller.status();
    expect(r.mapaForcaCiodes.estado).toBe('degraded');
  });

  it('Mapa Força down quando snapshot lança erro', async () => {
    const controller = new HealthController(
      makeMapaForcaMock(new Error('CSV indisponível')),
      makePrismaMock(),
    );
    const r = await controller.status();
    expect(r.mapaForcaCiodes.estado).toBe('down');
    expect(r.mapaForcaCiodes.detalhe).toContain('CSV indisponível');
  });

  it('Supabase degraded quando latência > 1000ms', async () => {
    const controller = new HealthController(
      makeMapaForcaMock(okSnap),
      makePrismaMock({ delayMs: 1100 }),
    );
    const r = await controller.status();
    expect(r.supabase.estado).toBe('degraded');
    expect(r.supabase.detalhe).toMatch(/lat.ncia/i);
  }, 5000);

  it('Supabase down quando $queryRaw lança erro', async () => {
    const controller = new HealthController(
      makeMapaForcaMock(okSnap),
      makePrismaMock({ throw: new Error('conexão perdida') }),
    );
    const r = await controller.status();
    expect(r.supabase.estado).toBe('down');
    expect(r.supabase.detalhe).toContain('conexão perdida');
  });

  it('services não-injetados retornam pending (defesa)', async () => {
    const controller = new HealthController();
    const r = await controller.status();
    expect(r.mapaForcaCiodes.estado).toBe('pending');
    expect(r.supabase.estado).toBe('pending');
  });

  it('todos os 3 serviços têm estado declarado + geradoEm presente', async () => {
    const controller = new HealthController(makeMapaForcaMock(okSnap), makePrismaMock());
    const r = await controller.status();
    expect(['ok', 'degraded', 'down', 'pending']).toContain(r.api.estado);
    expect(['ok', 'degraded', 'down', 'pending']).toContain(r.mapaForcaCiodes.estado);
    expect(['ok', 'degraded', 'down', 'pending']).toContain(r.supabase.estado);
    expect(r.geradoEm).toBeTruthy();
  });
});

// Avoid `vi` unused warning when chunks of the file are skipped.
void vi;

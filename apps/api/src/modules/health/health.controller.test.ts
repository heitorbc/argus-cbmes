import { describe, it, expect, vi } from 'vitest';
import type { MapaForcaSnapshot } from '@argus/shared-types';
import { HealthController } from './health.controller';
import type { SheetsDbService, SheetsDbStatus } from '../sheets-db/sheets-db.service';
import type { MapaForcaCiodesService } from '../mapa-forca-ciodes/mapa-forca-ciodes.service';

describe('HealthController.check (legacy)', () => {
  it('retorna status ok com service e timestamp ISO', () => {
    const controller = new HealthController();
    const result = controller.check();
    expect(result.status).toBe('ok');
    expect(result.service).toBe('argus-cbmes-api');
    expect(result.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});

describe('HealthController.status (S2.6)', () => {
  function makeSheetsDbMock(overrides: Partial<SheetsDbStatus> = {}): SheetsDbService {
    const base: SheetsDbStatus = {
      enabled: true,
      spreadsheetId: 'sid',
      bootstrappedAt: '2026-05-16T00:00:00.000Z',
      abas: [
        { nome: 'bd_escala_mensal', existe: true },
        { nome: 'bd_escala_especial', existe: true },
        { nome: 'bd_notas_servico', existe: true },
      ],
      ultimoErro: null,
    };
    return { getStatus: () => ({ ...base, ...overrides }) } as unknown as SheetsDbService;
  }

  function makeMapaForcaMock(snap: MapaForcaSnapshot | Error): MapaForcaCiodesService {
    return {
      getSnapshot: snap instanceof Error ? () => Promise.reject(snap) : () => Promise.resolve(snap),
    } as unknown as MapaForcaCiodesService;
  }

  it('retorna ok para todos os serviços quando tudo está saudável', async () => {
    const controller = new HealthController(
      makeSheetsDbMock(),
      makeMapaForcaMock({
        recursos: [],
        syncedAt: '2026-05-16T00:00:00.000Z',
        stale: false,
        fiscalDoDia: null,
      }),
    );
    const r = await controller.status();
    expect(r.api.estado).toBe('ok');
    expect(r.sheetsDb.estado).toBe('ok');
    expect(r.mapaForcaCiodes.estado).toBe('ok');
    expect(r.supabase.estado).toBe('pending');
    expect(r.geradoEm).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('Sheets-DB pending quando sem credenciais', async () => {
    const controller = new HealthController(
      makeSheetsDbMock({ enabled: false, bootstrappedAt: null }),
      makeMapaForcaMock({
        recursos: [],
        syncedAt: '2026-05-16T00:00:00.000Z',
        stale: false,
        fiscalDoDia: null,
      }),
    );
    const r = await controller.status();
    expect(r.sheetsDb.estado).toBe('pending');
  });

  it('Sheets-DB degraded quando alguma aba não existe', async () => {
    const controller = new HealthController(
      makeSheetsDbMock({
        abas: [
          { nome: 'bd_escala_mensal', existe: true },
          { nome: 'bd_escala_especial', existe: false },
          { nome: 'bd_notas_servico', existe: true },
        ],
      }),
      makeMapaForcaMock({
        recursos: [],
        syncedAt: '2026-05-16T00:00:00.000Z',
        stale: false,
        fiscalDoDia: null,
      }),
    );
    const r = await controller.status();
    expect(r.sheetsDb.estado).toBe('degraded');
    expect(r.sheetsDb.detalhe).toMatch(/aba.*ausente/);
  });

  it('Mapa Força degraded quando snapshot stale', async () => {
    const controller = new HealthController(
      makeSheetsDbMock(),
      makeMapaForcaMock({
        recursos: [],
        syncedAt: '2026-05-15T00:00:00.000Z',
        stale: true,
        fiscalDoDia: null,
      }),
    );
    const r = await controller.status();
    expect(r.mapaForcaCiodes.estado).toBe('degraded');
  });

  it('Mapa Força down quando snapshot lança erro', async () => {
    const controller = new HealthController(
      makeSheetsDbMock(),
      makeMapaForcaMock(new Error('CSV indisponível')),
    );
    const r = await controller.status();
    expect(r.mapaForcaCiodes.estado).toBe('down');
    expect(r.mapaForcaCiodes.detalhe).toContain('CSV indisponível');
  });

  it('services não-injetados retornam pending (defesa)', async () => {
    const controller = new HealthController();
    const r = await controller.status();
    expect(r.sheetsDb.estado).toBe('pending');
    expect(r.mapaForcaCiodes.estado).toBe('pending');
  });

  it('todos os 4 serviços têm estado declarado + geradoEm presente', async () => {
    const controller = new HealthController(
      makeSheetsDbMock(),
      makeMapaForcaMock({
        recursos: [],
        syncedAt: '2026-05-16T00:00:00.000Z',
        stale: false,
        fiscalDoDia: null,
      }),
    );
    const r = await controller.status();
    expect(['ok', 'degraded', 'down', 'pending']).toContain(r.api.estado);
    expect(['ok', 'degraded', 'down', 'pending']).toContain(r.sheetsDb.estado);
    expect(['ok', 'degraded', 'down', 'pending']).toContain(r.mapaForcaCiodes.estado);
    expect(['ok', 'degraded', 'down', 'pending']).toContain(r.supabase.estado);
    expect(r.geradoEm).toBeTruthy();
  });
});

// Avoid `vi` unused warning when chunks of the file are skipped.
void vi;

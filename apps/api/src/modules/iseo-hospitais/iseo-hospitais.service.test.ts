import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { IseoHospitaisService } from './iseo-hospitais.service';

const HEADER =
  'POSTO/GRAD,NOME DO MILITAR,NF,DATA DA ESCALA,TURNO,FUNÇÃO,CONTATO,CARGA HORÁRIA,OBM,LOTAÇÃO';

const HPM_CSV =
  HEADER +
  '\n' +
  'CB,NUBIA,4151194,15/05/2026,Diurno,Operador,,,,\n' +
  '3ºSGT,LIONEL,3033201,15/05/2026,Diurno,Operador,,,,\n' +
  'CB,SCARAMUSSA,3037509,16/05/2026,Noturno,Condutor,,,,\n';

const HIMABA_CSV =
  HEADER +
  '\n' +
  '3ºSGT,RAFAELA,2511894,15/05/2026,Diurno,Operador,,,,\n';

function makeConfig(overrides: Record<string, string | undefined> = {}): ConfigService {
  const map: Record<string, string | undefined> = {
    ISEO_HOSPITAIS_SHEET_ID: 'fake-sheet',
    ISEO_HPM_GID: '0',
    ISEO_HIMABA_GID: '111',
    ...overrides,
  };
  return {
    get: (key: string) => map[key],
  } as unknown as ConfigService;
}

describe('IseoHospitaisService', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async (url: string) => {
      const csv = url.includes('gid=111') ? HIMABA_CSV : HPM_CSV;
      return new Response(csv, { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('list() combina HPM + HIMABA', async () => {
    const svc = new IseoHospitaisService(makeConfig());
    const all = await svc.list();
    expect(all.length).toBe(4);
    const hpm = all.filter((e) => e.unidade === 'HPM');
    const himaba = all.filter((e) => e.unidade === 'HIMABA');
    expect(hpm.length).toBe(3);
    expect(himaba.length).toBe(1);
  });

  it('listDoDia filtra por dataIso', async () => {
    const svc = new IseoHospitaisService(makeConfig());
    const dia = await svc.listDoDia('2026-05-15');
    expect(dia.length).toBe(3);
    const dia2 = await svc.listDoDia('2026-05-16');
    expect(dia2.length).toBe(1);
  });

  it('listByMilitar filtra por NF', async () => {
    const svc = new IseoHospitaisService(makeConfig());
    const meus = await svc.listByMilitar('3037509');
    expect(meus.length).toBe(1);
    expect(meus[0]?.nome).toBe('SCARAMUSSA');
  });

  it('listByUnidade(HIMABA) ignora HPM mesmo quando ambas estão habilitadas', async () => {
    const svc = new IseoHospitaisService(makeConfig());
    const himaba = await svc.listByUnidade('HIMABA');
    expect(himaba.every((e) => e.unidade === 'HIMABA')).toBe(true);
  });

  it('quando HIMABA_GID vazio, HIMABA é desabilitada (não chama fetch)', async () => {
    const svc = new IseoHospitaisService(makeConfig({ ISEO_HIMABA_GID: '' }));
    const all = await svc.list();
    expect(all.every((e) => e.unidade === 'HPM')).toBe(true);
    expect(await svc.listByUnidade('HIMABA')).toEqual([]);
  });

  it('cache evita refetch dentro do TTL', async () => {
    const svc = new IseoHospitaisService(makeConfig());
    await svc.list();
    await svc.list();
    // 1 fetch HPM + 1 fetch HIMABA = 2 calls. 2ª chamada usa cache.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

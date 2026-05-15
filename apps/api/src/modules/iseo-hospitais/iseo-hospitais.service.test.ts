import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { IseoHospitaisService } from './iseo-hospitais.service';

const HEADER =
  'POSTO/GRAD,NOME DO MILITAR,NF,DATA DA ESCALA,TURNO,FUNÇÃO,CONTATO,CARGA HORÁRIA,OBM,LOTAÇÃO';

const HPM_JANEIRO_CSV =
  HEADER +
  '\n' +
  'CB,NUBIA,4151194,15/01/2026,Diurno,Operador,,,,\n' +
  '3ºSGT,LIONEL,3033201,15/01/2026,Diurno,Operador,,,,\n';

const HIMABA_JANEIRO_CSV =
  HEADER +
  '\n' +
  '3ºSGT,RAFAELA,2511894,15/01/2026,Diurno,Condutor,,,,\n';

const ABRIL_UNIFICADA_CSV =
  HEADER +
  '\n' +
  'CB,FULANO,1111111,01/04/2026,Diurno,Operador,,,HPM,ADM\n' +
  'CB,BELTRANO,2222222,01/04/2026,Noturno,Operador,,,HIMABA,DOP\n' +
  'CB,SEM_OBM,3333333,01/04/2026,Diurno,Operador,,,,\n';

const MAIO_UNIFICADA_CSV =
  HEADER +
  '\n' +
  '2ºSGT,SCARAMUSSA,3037509,29/05/2026,Diurno,Operador,,,HPM,1ªCia\n' +
  '2ºSGT,SCARAMUSSA,3037509,17/04/2026,Diurno,Operador,,,HIMABA,1ªCia\n';

function makeConfig(sheetNames?: string): ConfigService {
  const map: Record<string, string | undefined> = {
    ISEO_HOSPITAIS_SHEET_ID: 'fake-sheet',
    ISEO_SHEET_NAMES:
      sheetNames ?? 'HPM JANEIRO 2026,HIMABA JANEIRO 2026,ABRIL 2026,MAIO 2026',
  };
  return {
    get: (key: string) => map[key],
  } as unknown as ConfigService;
}

function csvForSheet(url: string): string {
  // URL tem `sheet=<encoded name>`. Extraímos e mapeamos para o CSV correto.
  const m = url.match(/sheet=([^&]+)/);
  if (!m) return '';
  const name = decodeURIComponent(m[1]!);
  if (name === 'HPM JANEIRO 2026') return HPM_JANEIRO_CSV;
  if (name === 'HIMABA JANEIRO 2026') return HIMABA_JANEIRO_CSV;
  if (name === 'ABRIL 2026') return ABRIL_UNIFICADA_CSV;
  if (name === 'MAIO 2026') return MAIO_UNIFICADA_CSV;
  return '';
}

describe('IseoHospitaisService', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async (url: string) => {
      const csv = csvForSheet(url);
      return new Response(csv, { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('list() combina todas as abas (HPM/HIMABA por nome + unificada por OBM)', async () => {
    const svc = new IseoHospitaisService(makeConfig());
    const all = await svc.list();
    // HPM JANEIRO=2 + HIMABA JANEIRO=1 + ABRIL=2 (HPM,HIMABA, descarta SEM_OBM) + MAIO=2 = 7
    expect(all.length).toBe(7);
    expect(all.filter((e) => e.unidade === 'HPM').length).toBe(4);
    expect(all.filter((e) => e.unidade === 'HIMABA').length).toBe(3);
  });

  it('aba unificada (sem prefixo HPM/HIMABA) descarta linha sem OBM válida', async () => {
    const svc = new IseoHospitaisService(makeConfig('ABRIL 2026'));
    const all = await svc.list();
    expect(all.length).toBe(2); // SEM_OBM (3333333) descartado
    const nfs = all.map((e) => e.nf).sort();
    expect(nfs).toEqual(['1111111', '2222222']);
  });

  it('listByMilitar consolida entries do militar em todas as abas', async () => {
    const svc = new IseoHospitaisService(makeConfig());
    const meus = await svc.listByMilitar('3037509');
    // SCARAMUSSA aparece 2x na aba MAIO 2026 (HPM 29/05 + HIMABA 17/04)
    expect(meus.length).toBe(2);
    const datas = meus.map((e) => `${e.unidade}|${e.dataIso}`).sort();
    expect(datas).toEqual(['HIMABA|2026-04-17', 'HPM|2026-05-29']);
  });

  it('dedupa entries duplicadas (mesma unidade+data+turno+nf em 2 abas)', async () => {
    // Configura ISEO_SHEET_NAMES com a mesma aba 2x — força duplicidade.
    const svc = new IseoHospitaisService(makeConfig('HPM JANEIRO 2026,HPM JANEIRO 2026'));
    const all = await svc.list();
    expect(all.length).toBe(2); // sem dup, seriam 4
  });

  it('listDoDia filtra por dataIso', async () => {
    const svc = new IseoHospitaisService(makeConfig());
    const dia = await svc.listDoDia('2026-05-29');
    expect(dia.length).toBe(1);
    expect(dia[0]?.nome).toBe('SCARAMUSSA');
  });

  it('cache evita refetch dentro do TTL', async () => {
    const svc = new IseoHospitaisService(makeConfig('HPM JANEIRO 2026'));
    await svc.list();
    await svc.list();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falha em uma aba não bloqueia as outras', async () => {
    let firstCall = true;
    fetchMock.mockImplementation(async (url: string) => {
      if (firstCall && url.includes('HPM')) {
        firstCall = false;
        return new Response('', { status: 500 });
      }
      return new Response(csvForSheet(url), { status: 200 });
    });
    const svc = new IseoHospitaisService(
      makeConfig('HPM JANEIRO 2026,HIMABA JANEIRO 2026'),
    );
    const all = await svc.list();
    expect(all.length).toBeGreaterThan(0);
    expect(all.some((e) => e.unidade === 'HIMABA')).toBe(true);
  });
});

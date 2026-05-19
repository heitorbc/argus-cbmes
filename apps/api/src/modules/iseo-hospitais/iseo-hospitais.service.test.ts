import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { makeIseoHospitaisPrismaMock } from '../../common/prisma/prisma-test-mock';
import { IseoHospitaisService } from './iseo-hospitais.service';
import { IseoHospitaisImportService } from './iseo-hospitais-import.service';

const HEADER =
  'POSTO/GRAD,NOME DO MILITAR,NF,DATA DA ESCALA,TURNO,FUNÇÃO,CONTATO,CARGA HORÁRIA,OBM,LOTAÇÃO';

const HPM_JANEIRO_CSV =
  HEADER +
  '\n' +
  'CB,NUBIA,4151194,15/01/2026,Diurno,Operador,,,,\n' +
  '3ºSGT,LIONEL,3033201,15/01/2026,Diurno,Operador,,,,\n';

const HIMABA_JANEIRO_CSV = HEADER + '\n' + '3ºSGT,RAFAELA,2511894,15/01/2026,Diurno,Condutor,,,,\n';

const ABRIL_REAL_CSV =
  'ESCALA DE INDENIZAÇÃO SUPLEMENTAR DE ESCALA OPERACIONAL - HOSPITAIS\n' +
  'POSTO/GRAD,,TURNO,FUNÇÃO,CH,,NOME DO MILITAR,CONTATO,,NOME DO MILITAR,CONTATO\n' +
  'CB,17/04/2026,Diurno,Condutor,12H,4190726,CB IERACITANO,(27) 99772-4174,3037509,2ºSGT BARCELLOS,(27) 99918-6697\n';

const MAIO_REAL_CSV =
  'ESCALA DE INDENIZAÇÃO SUPLEMENTAR DE ESCALA OPERACIONAL - HOSPITAIS\n' +
  'POSTO/GRAD,,TURNO,FUNÇÃO,CH,,NOME DO MILITAR,CONTATO,,NOME DO MILITAR,CONTATO\n' +
  '2ºSGT,29/05/2026,Diurno,Condutor,12H,3037509,2ºSGT BARCELLOS,(27) 99918-6697,2981378,2ºSGT MATEUS,(27) 99999-9999\n' +
  '3ºSGT,01/05/2026,Diurno,Operador,12H,3131335,3ºSGT ELIZANGELA,(27) 99507-2834,2894688,2ºSGT VICTOR DIAS,(28) 99968-0140\n';

function makeConfig(sheetNames?: string): ConfigService {
  const map: Record<string, string | undefined> = {
    ISEO_HOSPITAIS_SHEET_ID: 'fake-sheet',
    ISEO_SHEET_NAMES: sheetNames ?? 'HPM JANEIRO 2026,HIMABA JANEIRO 2026,ABRIL 2026,MAIO 2026',
  };
  return {
    get: (key: string) => map[key],
  } as unknown as ConfigService;
}

function csvForSheet(url: string): string {
  const m = url.match(/sheet=([^&]+)/);
  if (!m) return '';
  const name = decodeURIComponent(m[1]!);
  if (name === 'HPM JANEIRO 2026') return HPM_JANEIRO_CSV;
  if (name === 'HIMABA JANEIRO 2026') return HIMABA_JANEIRO_CSV;
  if (name === 'ABRIL 2026') return ABRIL_REAL_CSV;
  if (name === 'MAIO 2026') return MAIO_REAL_CSV;
  return '';
}

/**
 * S2.10.8c — Tests do fluxo completo (ImportService faz fetch+parse+upsert,
 * Service lê do Postgres). Antes (pre-S2.10.8c) o IseoHospitaisService
 * fazia o fetch direto in-memory; agora isso é responsabilidade do Import.
 */
describe('IseoHospitaisService + Import (S2.10.8c — Prisma)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let prisma: ReturnType<typeof makeIseoHospitaisPrismaMock>;
  let importSvc: IseoHospitaisImportService;
  let svc: IseoHospitaisService;

  function build(sheetNames?: string) {
    prisma = makeIseoHospitaisPrismaMock();
    importSvc = new IseoHospitaisImportService(makeConfig(sheetNames), prisma);
    svc = new IseoHospitaisService(prisma, importSvc);
  }

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

  it('sync + list() combina todas as abas (HPM/HIMABA por nome + unificada por par)', async () => {
    build();
    await importSvc.syncToDatabase();
    const all = await svc.list();
    // HPM JANEIRO=2 + HIMABA JANEIRO=1 + ABRIL=2 + MAIO=4 = 9
    expect(all.length).toBe(9);
    expect(all.filter((e) => e.unidade === 'HPM').length).toBe(5);
    expect(all.filter((e) => e.unidade === 'HIMABA').length).toBe(4);
  });

  it('aba unificada (ABRIL/MAIO): 1º par = HPM, 2º par = HIMABA', async () => {
    build('ABRIL 2026');
    await importSvc.syncToDatabase();
    const all = await svc.list();
    expect(all.length).toBe(2);
    expect(all.find((e) => e.nf === '4190726')?.unidade).toBe('HPM');
    expect(all.find((e) => e.nf === '3037509')?.unidade).toBe('HIMABA');
  });

  it('listByMilitar consolida entries do militar em todas as abas', async () => {
    build();
    await importSvc.syncToDatabase();
    const meus = await svc.listByMilitar('3037509');
    expect(meus.length).toBe(2);
    const datas = meus.map((m) => `${m.dataIso}/${m.unidade}`).sort();
    expect(datas).toEqual(['2026-04-17/HIMABA', '2026-05-29/HPM']);
  });

  it('dedupa entries duplicadas (mesma unidade+data+turno+nf em 2 abas)', async () => {
    build('HPM JANEIRO 2026,HPM JANEIRO 2026');
    await importSvc.syncToDatabase();
    const all = await svc.list();
    expect(all.length).toBe(2); // sem dup, seriam 4
  });

  it('listDoDia filtra por dataIso', async () => {
    build();
    await importSvc.syncToDatabase();
    const dia = await svc.listDoDia('2026-05-29');
    expect(dia.length).toBe(2);
    expect(dia.find((e) => e.nf === '3037509')?.unidade).toBe('HPM');
    expect(dia.find((e) => e.nf === '2981378')?.unidade).toBe('HIMABA');
  });

  it('idempotência: 2 syncs com mesmo CSV → tudo updated, nada duplicado', async () => {
    build();
    const r1 = await importSvc.syncToDatabase();
    const r2 = await importSvc.syncToDatabase();
    expect(r1.created).toBe(9);
    expect(r2.created).toBe(0);
    expect(r2.updated).toBe(9);
    const all = await svc.list();
    expect(all.length).toBe(9); // sem duplicação
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
    build('HPM JANEIRO 2026,HIMABA JANEIRO 2026');
    const r = await importSvc.syncToDatabase();
    expect(r.inconsistencias.length).toBeGreaterThan(0); // HPM falhou
    const all = await svc.list();
    expect(all.length).toBeGreaterThan(0);
    expect(all.some((e) => e.unidade === 'HIMABA')).toBe(true);
  });

  it('getSyncStatus retorna 2 entries (HPM + HIMABA) com counts corretos', async () => {
    build();
    await importSvc.syncToDatabase();
    const status = await svc.getSyncStatus();
    expect(status).toHaveLength(2);
    const hpm = status.find((s) => s.unidade === 'HPM');
    const himaba = status.find((s) => s.unidade === 'HIMABA');
    expect(hpm?.count).toBe(5);
    expect(himaba?.count).toBe(4);
  });
});

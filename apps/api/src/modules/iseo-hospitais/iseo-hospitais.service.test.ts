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

const HIMABA_JANEIRO_CSV = HEADER + '\n' + '3ºSGT,RAFAELA,2511894,15/01/2026,Diurno,Condutor,,,,\n';

// Estrutura real das abas ABRIL/MAIO 2026 (verificada via WebFetch em S2.8.1):
// dados compartilhados em B-E (DATA/TURNO/FUNÇÃO/CH), 1º par F-H (HPM:
// NF/NOME/CONTATO), 2º par I-K (HIMABA: NF/NOME/CONTATO). Sem coluna OBM.
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
  // URL tem `sheet=<encoded name>`. Extraímos e mapeamos para o CSV correto.
  const m = url.match(/sheet=([^&]+)/);
  if (!m) return '';
  const name = decodeURIComponent(m[1]!);
  if (name === 'HPM JANEIRO 2026') return HPM_JANEIRO_CSV;
  if (name === 'HIMABA JANEIRO 2026') return HIMABA_JANEIRO_CSV;
  if (name === 'ABRIL 2026') return ABRIL_REAL_CSV;
  if (name === 'MAIO 2026') return MAIO_REAL_CSV;
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

  it('list() combina todas as abas (HPM/HIMABA por nome + unificada por OBM/default)', async () => {
    const svc = new IseoHospitaisService(makeConfig());
    const all = await svc.list();
    // HPM JANEIRO=2 + HIMABA JANEIRO=1 + ABRIL=2 (1 linha × 2 pares HPM+HIMABA)
    //   + MAIO=4 (2 linhas × 2 pares cada) = 9
    expect(all.length).toBe(9);
    expect(all.filter((e) => e.unidade === 'HPM').length).toBe(5);
    expect(all.filter((e) => e.unidade === 'HIMABA').length).toBe(4);
  });

  it('aba unificada (ABRIL/MAIO): 1º par = HPM, 2º par = HIMABA (S2.8.1)', async () => {
    const svc = new IseoHospitaisService(makeConfig('ABRIL 2026'));
    const all = await svc.list();
    expect(all.length).toBe(2);
    expect(all.find((e) => e.nf === '4190726')?.unidade).toBe('HPM'); // 1º par
    expect(all.find((e) => e.nf === '3037509')?.unidade).toBe('HIMABA'); // 2º par
  });

  it('aba unificada estilo MAIO 2026 (pareada): Heitor aparece como HPM em 29/05', async () => {
    const svc = new IseoHospitaisService(makeConfig('MAIO 2026'));
    const meus = await svc.listByMilitar('3037509');
    expect(meus.length).toBe(1);
    expect(meus[0]?.dataIso).toBe('2026-05-29');
    expect(meus[0]?.unidade).toBe('HPM'); // 1º par
    expect(meus[0]?.turno).toBe('Diurno');
  });

  it('listByMilitar consolida entries do militar em todas as abas', async () => {
    const svc = new IseoHospitaisService(makeConfig());
    const meus = await svc.listByMilitar('3037509');
    // BARCELLOS aparece 1x em MAIO (29/05 HPM) e 1x em ABRIL (17/04 HIMABA, 2º par)
    expect(meus.length).toBe(2);
    const datas = meus.map((m) => `${m.dataIso}/${m.unidade}`).sort();
    expect(datas).toEqual(['2026-04-17/HIMABA', '2026-05-29/HPM']);
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
    // 29/05 tem 1 linha × 2 pares = 2 entries (Heitor HPM + Mateus HIMABA)
    expect(dia.length).toBe(2);
    expect(dia.find((e) => e.nf === '3037509')?.unidade).toBe('HPM');
    expect(dia.find((e) => e.nf === '2981378')?.unidade).toBe('HIMABA');
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
    const svc = new IseoHospitaisService(makeConfig('HPM JANEIRO 2026,HIMABA JANEIRO 2026'));
    const all = await svc.list();
    expect(all.length).toBeGreaterThan(0);
    expect(all.some((e) => e.unidade === 'HIMABA')).toBe(true);
  });
});

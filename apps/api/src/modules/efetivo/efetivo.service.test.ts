import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { EfetivoService } from './efetivo.service';

const HEADER =
  'QTD,NF,ANT.,POS/GRAD,NOME COMPLETO,PRONTUÁRIO,TEL,RG,CPF,NASCIMENTO,EMAIL,VALIDADE CNH,HABILITAÇÃO,MÊS/ANO CCVE,Município,INCORP.,IDADE,SERVIÇO,ÚLTIMA CHAMADA,PARA FINS DE,SITUAÇÃO,PRÓXIMA,VENC.,FÉRIAS,Senso,,,,,,DATA ATUAL';

const SAMPLE_CSV = [
  HEADER,
  '1,903209,24,TC,SIWAMY REIS DOS ANJOS,,,,,26/10/1980,,,,,,19/03/2001,,,,,,,,,,,,,,,',
  '2,2693119,36,MAJ,HEITOR HENRIQUE LUBE DA SILVA,,,,,16/01/1989,,,,,,02/06/2008,37,17,,,,,,,,,,,,,',
  '24,3037509,419,2ºSGT,HEITOR BARCELLOS COELHO,41735,(27) 999106697,1201907/ES,,23/02/1989,heitorhbc@gmail.com,22/03/2030,AE,2021,Vila Velha,16/03/2009,37,17,,CSASCT,,,,,,,,,,',
].join('\n');

function makeService(): EfetivoService {
  const config = {
    get: () => undefined,
    getOrThrow: (key: string) => {
      if (key === 'GOOGLE_SHEET_ID_EFETIVO') return 'fake-sheet-id';
      throw new Error(`Missing ${key}`);
    },
  } as unknown as ConfigService;
  return new EfetivoService(config);
}

function stubFetch(csv: string, ok = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        ok,
        status: ok ? 200 : 500,
        text: () => Promise.resolve(csv),
      } as Response),
    ),
  );
}

describe('EfetivoService.list', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('retorna lista paginada ordenada por ANT', async () => {
    stubFetch(SAMPLE_CSV);
    const service = makeService();

    const r = await service.list({ page: 1, pageSize: 20 });

    expect(r.total).toBe(3);
    expect(r.items[0]?.ant).toBe(24);
    expect(r.items[2]?.ant).toBe(419);
    expect(r.stale).toBe(false);
  });

  it('filtra por busca textual em NF, nome ou posto', async () => {
    stubFetch(SAMPLE_CSV);
    const service = makeService();

    const r = await service.list({ q: 'BARCELLOS', page: 1, pageSize: 20 });
    expect(r.total).toBe(1);
    expect(r.items[0]?.nf).toBe('3037509');

    const r2 = await service.list({ q: '903209', page: 1, pageSize: 20 });
    expect(r2.total).toBe(1);
    expect(r2.items[0]?.posto).toBe('TC');

    const r3 = await service.list({ q: 'maj', page: 1, pageSize: 20 });
    expect(r3.total).toBe(1);
  });

  it('aplica paginação corretamente', async () => {
    stubFetch(SAMPLE_CSV);
    const service = makeService();

    const r1 = await service.list({ page: 1, pageSize: 2 });
    expect(r1.items).toHaveLength(2);
    expect(r1.totalPages).toBe(2);

    const r2 = await service.list({ page: 2, pageSize: 2 });
    expect(r2.items).toHaveLength(1);
    expect(r2.items[0]?.nf).toBe('3037509');
  });

  it('cacheia resultados (segunda chamada não dispara fetch)', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(SAMPLE_CSV),
      } as Response),
    );
    vi.stubGlobal('fetch', fetchMock);

    const service = makeService();
    await service.list({ page: 1, pageSize: 20 });
    await service.list({ page: 1, pageSize: 20 });
    await service.list({ page: 1, pageSize: 20 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('EfetivoService — falhas', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('serve último snapshot com stale=true se nova sync falha', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve(SAMPLE_CSV),
      } as Response)
      .mockRejectedValueOnce(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);

    const service = makeService();
    // 1ª chamada popula cache
    await service.list({ page: 1, pageSize: 20 });
    // forceSync invalida cache → 2ª fetch falha → serve último snapshot
    const r = await service.forceSync();
    expect(r.stale).toBe(true);
    expect(r.total).toBe(3);
  });

  it('lança 503 se primeira sync falha e não há snapshot', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('network down'))),
    );

    const service = makeService();
    await expect(service.list({ page: 1, pageSize: 20 })).rejects.toThrow(/sincronizar/);
  });
});

describe('EfetivoService.findByNf', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    stubFetch(SAMPLE_CSV);
  });

  it('encontra Heitor Barcellos por NF', async () => {
    const service = makeService();
    const m = await service.findByNf('3037509');
    expect(m?.nome).toBe('HEITOR BARCELLOS COELHO');
  });

  it('retorna null para NF inexistente', async () => {
    const service = makeService();
    expect(await service.findByNf('9999999')).toBeNull();
  });
});

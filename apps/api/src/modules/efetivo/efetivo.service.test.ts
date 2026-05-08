import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { EfetivoService } from './efetivo.service';
import { QdiService } from './qdi.service';

const HEADER =
  'QTD,NF,ANT.,POS/GRAD,NOME COMPLETO,PRONTUÁRIO,TEL,RG,CPF,NASCIMENTO,EMAIL,VALIDADE CNH,HABILITAÇÃO,MÊS/ANO CCVE,Município,INCORP.,IDADE,SERVIÇO,ÚLTIMA CHAMADA,PARA FINS DE,SITUAÇÃO,PRÓXIMA,VENC.,FÉRIAS,Senso,,,,,,DATA ATUAL';

const SAMPLE_CSV = [
  HEADER,
  '1,903209,24,TC,SIWAMY REIS DOS ANJOS,,,,,26/10/1980,,,,,,19/03/2001,,,,,,,,,,,,,,,',
  '2,2693119,36,MAJ,HEITOR HENRIQUE LUBE DA SILVA,,,,,16/01/1989,,,,,,02/06/2008,37,17,,,,,,,,,,,,,',
  '24,3037509,419,2ºSGT,HEITOR BARCELLOS COELHO,41735,(27) 999106697,1201907/ES,,23/02/1989,heitorhbc@gmail.com,22/03/2030,AE,2021,Vila Velha,16/03/2009,37,17,,CSASCT,,,,,,,,,,',
].join('\n');

function makeService(qdiByNf?: Map<string, ReturnType<typeof makeQdiEntry>>): EfetivoService {
  const config = {
    get: () => undefined,
    getOrThrow: (key: string) => {
      if (key === 'GOOGLE_SHEET_ID_EFETIVO') return 'fake-sheet-id';
      throw new Error(`Missing ${key}`);
    },
  } as unknown as ConfigService;

  // QdiService mock — retorna dados controlados ou vazio
  const qdi = {
    getByNf: vi
      .fn()
      .mockResolvedValue({ byNf: qdiByNf ?? new Map(), syncedAt: Date.now(), stale: false }),
  } as unknown as QdiService;

  return new EfetivoService(config, qdi);
}

function makeQdiEntry(opts: {
  nf: string;
  ant: number;
  postoAtual: string;
  nomeGuerra: string;
  funcao?: string;
  subSecao: 'staff' | 'sos' | 'guarda' | 'aquaticas';
}) {
  return {
    nf: opts.nf,
    ant: opts.ant,
    postoAtual: opts.postoAtual,
    nomeGuerra: opts.nomeGuerra,
    funcao: opts.funcao,
    subSecao: opts.subSecao,
    unidade: '1ª Cia / 1º BBM',
    situacao: 'APTO',
  };
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

describe('EfetivoService consolidação com QDI', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    stubFetch(SAMPLE_CSV);
  });

  it('enriquece com QDI quando NF presente em ambas as fontes (QDI vence ANT/posto, mantém nome completo)', async () => {
    const qdi = new Map([
      [
        '3037509',
        makeQdiEntry({
          nf: '3037509',
          ant: 418, // diferente da EFETIVO (419) — QDI vence
          postoAtual: '2ºSGT',
          nomeGuerra: 'BARCELLOS',
          subSecao: 'sos',
        }),
      ],
    ]);
    const service = makeService(qdi);
    const r = await service.list({ page: 1, pageSize: 20 });

    const heitor = r.items.find((m) => m.nf === '3037509');
    expect(heitor).toBeDefined();
    expect(heitor?.ant).toBe(418); // do QDI
    expect(heitor?.posto).toBe('2ºSGT');
    expect(heitor?.nome).toBe('HEITOR BARCELLOS COELHO'); // nome completo do EFETIVO
    expect(heitor?.nomeGuerra).toBe('BARCELLOS');
    expect(heitor?.subSecao).toBe('sos');
    expect(heitor?.idade).toBe(37); // demográfico do EFETIVO mantido
  });

  it('inclui militares só presentes no QDI (com nome = nomeGuerra)', async () => {
    const qdi = new Map([
      [
        '9999999',
        makeQdiEntry({
          nf: '9999999',
          ant: 100,
          postoAtual: 'CB',
          nomeGuerra: 'NOVATO',
          subSecao: 'guarda',
        }),
      ],
    ]);
    const service = makeService(qdi);
    const r = await service.list({ page: 1, pageSize: 20 });

    const novato = r.items.find((m) => m.nf === '9999999');
    expect(novato).toBeDefined();
    expect(novato?.nome).toBe('NOVATO'); // fallback para nomeGuerra
    expect(novato?.idade).toBeUndefined(); // sem dados demográficos
  });

  it('filtro somente1aCia retorna apenas militares com subSecao definida', async () => {
    const qdi = new Map([
      [
        '3037509',
        makeQdiEntry({
          nf: '3037509',
          ant: 418,
          postoAtual: '2ºSGT',
          nomeGuerra: 'BARCELLOS',
          subSecao: 'sos',
        }),
      ],
    ]);
    const service = makeService(qdi);

    const semFiltro = await service.list({ page: 1, pageSize: 20 });
    expect(semFiltro.total).toBe(3); // todos do EFETIVO

    const apenasCia = await service.list({ somente1aCia: true, page: 1, pageSize: 20 });
    expect(apenasCia.total).toBe(1);
    expect(apenasCia.items[0]?.nf).toBe('3037509');
  });

  it('busca textual encontra por nomeGuerra além de NF/nome/posto', async () => {
    const qdi = new Map([
      [
        '3037509',
        makeQdiEntry({
          nf: '3037509',
          ant: 418,
          postoAtual: '2ºSGT',
          nomeGuerra: 'BARCELLOS',
          subSecao: 'sos',
        }),
      ],
    ]);
    const service = makeService(qdi);

    const r = await service.list({ q: 'barcellos', page: 1, pageSize: 20 });
    expect(r.total).toBe(1);
  });

  it('quando QDI está indisponível, retorna apenas EFETIVO (sem subSecao)', async () => {
    const config = {
      get: () => undefined,
      getOrThrow: (key: string) => {
        if (key === 'GOOGLE_SHEET_ID_EFETIVO') return 'fake-sheet-id';
        throw new Error(`Missing ${key}`);
      },
    } as unknown as ConfigService;
    const qdi = {
      getByNf: vi.fn().mockRejectedValue(new Error('qdi down')),
    } as unknown as QdiService;

    const service = new EfetivoService(config, qdi);
    const r = await service.list({ page: 1, pageSize: 20 });
    expect(r.total).toBe(3);
    expect(r.items.every((m) => m.subSecao === undefined)).toBe(true);
  });
});

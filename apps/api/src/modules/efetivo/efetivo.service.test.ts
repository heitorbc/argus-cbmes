import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { EfetivoService } from './efetivo.service';
import { QdiService } from './qdi.service';
import { QdiDadosService } from './qdi-dados.service';
import type { MilitarDados } from './qdi-dados-csv-parser';

const HEADER =
  'QTD,NF,ANT.,POS/GRAD,NOME COMPLETO,PRONTUÁRIO,TEL,RG,CPF,NASCIMENTO,EMAIL,VALIDADE CNH,HABILITAÇÃO,MÊS/ANO CCVE,Município,INCORP.,IDADE,SERVIÇO,ÚLTIMA CHAMADA,PARA FINS DE,SITUAÇÃO,PRÓXIMA,VENC.,FÉRIAS,Senso,,,,,,DATA ATUAL';

const SAMPLE_CSV = [
  HEADER,
  '1,903209,24,TC,SIWAMY REIS DOS ANJOS,,,,,26/10/1980,,,,,,19/03/2001,,,,,,,,,,,,,,,',
  '2,2693119,36,MAJ,HEITOR HENRIQUE LUBE DA SILVA,,,,,16/01/1989,,,,,,02/06/2008,37,17,,,,,,,,,,,,,',
  '24,3037509,419,2ºSGT,HEITOR BARCELLOS COELHO,41735,(27) 999106697,1201907/ES,,23/02/1989,heitorhbc@gmail.com,22/03/2030,AE,2021,Vila Velha,16/03/2009,37,17,,CSASCT,,,,,,,,,,',
].join('\n');

function makeService(opts?: {
  qdiByNf?: Map<string, ReturnType<typeof makeQdiEntry>>;
  dadosByNf?: Map<string, MilitarDados>;
  qdiAvailable?: boolean;
  dadosAvailable?: boolean;
}): EfetivoService {
  const config = {
    get: () => undefined,
    getOrThrow: (key: string) => {
      if (key === 'GOOGLE_SHEET_ID_EFETIVO') return 'fake-sheet-id';
      throw new Error(`Missing ${key}`);
    },
  } as unknown as ConfigService;

  const qdi = {
    getByNf:
      opts?.qdiAvailable === false
        ? vi.fn().mockRejectedValue(new Error('qdi down'))
        : vi.fn().mockResolvedValue({
            byNf: opts?.qdiByNf ?? new Map(),
            syncedAt: Date.now(),
            stale: false,
          }),
  } as unknown as QdiService;

  const qdiDados = {
    getByNf:
      opts?.dadosAvailable === false
        ? vi.fn().mockRejectedValue(new Error('qdi-dados down'))
        : vi.fn().mockResolvedValue({
            byNf: opts?.dadosByNf ?? new Map(),
            syncedAt: Date.now(),
            stale: false,
          }),
  } as unknown as QdiDadosService;

  return new EfetivoService(config, qdi, qdiDados);
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

function makeDadosEntry(opts: {
  nf: string;
  ant: number;
  posto: string;
  nome: string;
  nomeGuerra?: string;
  lotacao?: string;
}): MilitarDados {
  return {
    nf: opts.nf,
    ant: opts.ant,
    posto: opts.posto,
    nome: opts.nome,
    nomeGuerra: opts.nomeGuerra,
    lotacao: opts.lotacao ?? '1ª1º',
    municipio: undefined,
    situacao: undefined,
    classe: undefined,
    conceitoDisciplinar: undefined,
    pontos: undefined,
    cnh: undefined,
    cnhValidade: undefined,
    incorporacao: undefined,
    planoFerias: undefined,
    mergulho: undefined,
    ftba: undefined,
    etsp: undefined,
    ccve: undefined,
    ccveValidade: undefined,
    censo: undefined,
  };
}

/** DADOS para os 3 militares do SAMPLE_CSV — usado em testes que esperam ver toda a lista. */
function dadosFromSampleCsv(): Map<string, MilitarDados> {
  return new Map([
    [
      '903209',
      makeDadosEntry({ nf: '903209', ant: 24, posto: 'TC', nome: 'SIWAMY REIS DOS ANJOS' }),
    ],
    [
      '2693119',
      makeDadosEntry({
        nf: '2693119',
        ant: 36,
        posto: 'MAJ',
        nome: 'HEITOR HENRIQUE LUBE DA SILVA',
      }),
    ],
    [
      '3037509',
      makeDadosEntry({
        nf: '3037509',
        ant: 419,
        posto: '2ºSGT',
        nome: 'HEITOR BARCELLOS COELHO',
        nomeGuerra: 'BARCELLOS',
      }),
    ],
  ]);
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
    const service = makeService({ dadosByNf: dadosFromSampleCsv() });

    const r = await service.list({ page: 1, pageSize: 20 });

    expect(r.total).toBe(3);
    expect(r.items[0]?.ant).toBe(24);
    expect(r.items[2]?.ant).toBe(419);
    expect(r.stale).toBe(false);
  });

  it('filtra por busca textual em NF, nome ou posto', async () => {
    stubFetch(SAMPLE_CSV);
    const service = makeService({ dadosByNf: dadosFromSampleCsv() });

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
    const service = makeService({ dadosByNf: dadosFromSampleCsv() });

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

    const service = makeService({ dadosByNf: dadosFromSampleCsv() });
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

    const service = makeService({ dadosByNf: dadosFromSampleCsv() });
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

  it('encontra Heitor Barcellos por NF (presente em DADOS+EFETIVO)', async () => {
    const service = makeService({ dadosByNf: dadosFromSampleCsv() });
    const m = await service.findByNf('3037509');
    expect(m?.nome).toBe('HEITOR BARCELLOS COELHO');
  });

  it('retorna null para NF inexistente', async () => {
    const service = makeService({ dadosByNf: dadosFromSampleCsv() });
    expect(await service.findByNf('9999999')).toBeNull();
  });
});

describe('EfetivoService consolidação 3 fontes (DADOS > 1ª1º > EFETIVO)', () => {
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
          ant: 418, // diferente da EFETIVO (419) — QDI vence sobre EFETIVO base
          postoAtual: '2ºSGT',
          nomeGuerra: 'BARCELLOS',
          subSecao: 'sos',
        }),
      ],
    ]);
    const service = makeService({ qdiByNf: qdi });
    const r = await service.list({ page: 1, pageSize: 20 });

    const heitor = r.items.find((m) => m.nf === '3037509');
    expect(heitor).toBeDefined();
    expect(heitor?.ant).toBe(418); // do QDI
    expect(heitor?.posto).toBe('2ºSGT');
    expect(heitor?.nome).toBe('HEITOR BARCELLOS COELHO'); // nome completo do EFETIVO (enriquecimento)
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
    const service = makeService({ qdiByNf: qdi });
    const r = await service.list({ page: 1, pageSize: 20 });

    const novato = r.items.find((m) => m.nf === '9999999');
    expect(novato).toBeDefined();
    expect(novato?.nome).toBe('NOVATO'); // fallback para nomeGuerra
    expect(novato?.idade).toBeUndefined(); // sem dados demográficos
  });

  it('inclui militares só presentes em DADOS', async () => {
    const dados = new Map([
      [
        '8888888',
        makeDadosEntry({
          nf: '8888888',
          ant: 200,
          posto: '3ºSGT',
          nome: 'JOSÉ DA SILVA',
          nomeGuerra: 'SILVA',
        }),
      ],
    ]);
    const service = makeService({ dadosByNf: dados });
    const r = await service.list({ page: 1, pageSize: 20 });

    const silva = r.items.find((m) => m.nf === '8888888');
    expect(silva).toBeDefined();
    expect(silva?.posto).toBe('3ºSGT');
    expect(silva?.nome).toBe('JOSÉ DA SILVA');
    expect(silva?.lotacao).toBe('1ª1º');
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
    const service = makeService({ qdiByNf: qdi, dadosByNf: dadosFromSampleCsv() });

    const semFiltro = await service.list({ page: 1, pageSize: 20 });
    expect(semFiltro.total).toBe(3); // do DADOS

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
    const service = makeService({ qdiByNf: qdi });

    const r = await service.list({ q: 'barcellos', page: 1, pageSize: 20 });
    expect(r.total).toBe(1);
  });

  it('quando QDI/DADOS estão indisponíveis, retorna lista vazia (EFETIVO sozinho não inclui ninguém)', async () => {
    const service = makeService({ qdiAvailable: false, dadosAvailable: false });
    const r = await service.list({ page: 1, pageSize: 20 });
    // Após S6a-fix: EFETIVO não pode adicionar NFs sozinho. Sem QDI nem DADOS, lista vazia.
    expect(r.total).toBe(0);
  });
});

describe('EfetivoService — regra "EFETIVO só enriquece, não adiciona NFs" (S6a-fix item 2)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('NÃO inclui militares só presentes no EFETIVO (lista da 1ª Cia depende de DADOS+1ª1º)', async () => {
    // SAMPLE_CSV tem 3 militares; nenhum em DADOS nem 1ª1º (mocks vazios) → lista vazia
    stubFetch(SAMPLE_CSV);
    const service = makeService();
    const r = await service.list({ page: 1, pageSize: 20 });
    expect(r.total).toBe(0);
  });

  it('CAP ALAN (3269779) e TEN ALINE (4544935) não aparecem se ausentes em DADOS+1ª1º', async () => {
    // CAP ALAN e TEN ALINE estão no EFETIVO geral mas não pertencem à 1ª1º;
    // em S6a tinham vazado para a lista. Após o fix: ausentes.
    const csvComAlanAline = [
      HEADER,
      '50,3269779,250,CAP,ALAN ALMEIDA SILVEIRA,,,,,01/01/1985,,,,,,01/01/2010,,,,,,,,,,,,,,,',
      '51,4544935,260,1ºTEN,ALINE BARROS,,,,,01/01/1990,,,,,,01/01/2015,,,,,,,,,,,,,,,',
      '24,3037509,419,2ºSGT,HEITOR BARCELLOS COELHO,41735,(27) 999106697,,,23/02/1989,,,,,,16/03/2009,37,17,,,,,,,,,,,,,',
    ].join('\n');
    stubFetch(csvComAlanAline);
    const service = makeService({
      dadosByNf: new Map([
        [
          '3037509',
          makeDadosEntry({
            nf: '3037509',
            ant: 419,
            posto: '2ºSGT',
            nome: 'HEITOR BARCELLOS COELHO',
            nomeGuerra: 'BARCELLOS',
          }),
        ],
      ]),
    });

    const r = await service.list({ page: 1, pageSize: 200 });
    expect(r.items.find((m) => m.nf === '3269779')).toBeUndefined();
    expect(r.items.find((m) => m.nf === '4544935')).toBeUndefined();
    expect(r.items.find((m) => m.nf === '3037509')).toBeDefined();
  });

  it('militar em DADOS recebe enriquecimento de campos do EFETIVO (idade, serviço)', async () => {
    stubFetch(SAMPLE_CSV);
    const service = makeService({
      dadosByNf: new Map([
        [
          '3037509',
          makeDadosEntry({
            nf: '3037509',
            ant: 419,
            posto: '2ºSGT',
            nome: 'HEITOR BARCELLOS COELHO',
            nomeGuerra: 'BARCELLOS',
          }),
        ],
      ]),
    });
    const r = await service.findByNf('3037509');
    expect(r?.idade).toBe(37); // veio do EFETIVO
    expect(r?.servico).toBe(17); // veio do EFETIVO
    expect(r?.lotacao).toBe('1ª1º'); // veio do DADOS
  });

  it('militar só em 1ª1º (ausente em DADOS e EFETIVO) ainda aparece', async () => {
    stubFetch(SAMPLE_CSV);
    const service = makeService({
      qdiByNf: new Map([
        [
          '7777777',
          makeQdiEntry({
            nf: '7777777',
            ant: 100,
            postoAtual: 'CB',
            nomeGuerra: 'JUNIOR',
            subSecao: 'aquaticas',
          }),
        ],
      ]),
    });
    const r = await service.findByNf('7777777');
    expect(r).toBeDefined();
    expect(r?.nome).toBe('JUNIOR');
    expect(r?.subSecao).toBe('aquaticas');
  });
});

describe('EfetivoService — incluirEfetivoOrfao (S6c/F1) — NomeMatcher da Prévia', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('default (incluirEfetivoOrfao ausente): militar só em EFETIVO NÃO aparece (S6a-fix)', async () => {
    // SAMPLE_CSV tem 3 militares no EFETIVO; nenhum em DADOS+1ª1º
    stubFetch(SAMPLE_CSV);
    const service = makeService();
    const all = await service.getAll({ somente1aCia: false });
    expect(all).toHaveLength(0);
  });

  it('incluirEfetivoOrfao=true: militar só em EFETIVO aparece (NomeMatcher consegue resolver)', async () => {
    stubFetch(SAMPLE_CSV);
    const service = makeService();
    const all = await service.getAll({ somente1aCia: false, incluirEfetivoOrfao: true });
    // SAMPLE_CSV tem 3 militares — todos aparecem
    expect(all).toHaveLength(3);
    expect(all.find((m) => m.nf === '3037509')).toBeDefined();
    expect(all.find((m) => m.nf === '903209')).toBeDefined();
  });

  it('somente1aCia=true ignora incluirEfetivoOrfao (página /cadastros/efetivo continua filtrada)', async () => {
    stubFetch(SAMPLE_CSV);
    const service = makeService({
      qdiByNf: new Map([
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
      ]),
    });
    // Mesmo com incluirEfetivoOrfao=true, somente1aCia filtra por subSecao definida
    const r = await service.getAll({ somente1aCia: true, incluirEfetivoOrfao: true });
    expect(r).toHaveLength(1);
    expect(r[0]?.nf).toBe('3037509');
    // 903209 e 2693119 (só em EFETIVO sem subSecao) ficam fora
  });

  it('findByNf inclui EFETIVO órfão (página de detalhe /cadastros/efetivo/:nf)', async () => {
    stubFetch(SAMPLE_CSV);
    const service = makeService(); // sem QDI nem DADOS
    const r = await service.findByNf('3037509');
    // S6c/F1: findByNf usa incluirEfetivoOrfao=true internamente
    expect(r).toBeDefined();
    expect(r?.nome).toBe('HEITOR BARCELLOS COELHO');
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import type { ComposicaoEntry, EscalaMensal } from '@argus/shared-types';
import { EscalasService, computeDiff, quinzenaDoDia } from './escalas.service';

const composicaoBase: ComposicaoEntry[] = [
  {
    equipe: 'C',
    viatura: 'ABTS 01',
    funcao: 'Ch',
    militar: { raw: '2º SGT BARCELLOS', postoAbreviado: '2ºSGT', nomeGuerra: 'BARCELLOS' },
  },
  {
    equipe: 'C',
    viatura: 'ABTS 01',
    funcao: 'Op 1',
    militar: { raw: 'SD MARTINELLI', postoAbreviado: 'SD', nomeGuerra: 'MARTINELLI' },
  },
  {
    equipe: 'A',
    viatura: 'ABTS 01',
    funcao: 'Ch',
    militar: { raw: '3º SGT LOUZADA', postoAbreviado: '3ºSGT', nomeGuerra: 'LOUZADA' },
  },
];

function fakeEscala(overrides: Partial<EscalaMensal> = {}): EscalaMensal {
  return {
    mes: 5,
    ano: 2026,
    origemArquivo: 'fake.xlsx',
    importadoEm: '2026-05-08T00:00:00.000Z',
    importadoPorNf: '3037509',
    diaEquipe: {
      '2026-05-01': 'C',
      '2026-05-02': 'D',
      '2026-05-03': 'A',
      '2026-05-20': 'C',
    },
    composicaoPorQuinzena: {
      q1: composicaoBase,
      q2: composicaoBase,
      ultimoDiaQ1: 14,
    },
    avisos: [],
    ...overrides,
  };
}

describe('EscalasService', () => {
  let service: EscalasService;

  beforeEach(() => {
    service = new EscalasService();
  });

  it('save + get pelo mês', () => {
    const escala = fakeEscala();
    service.save(escala);
    expect(service.get(2026, 5)).toEqual(escala);
    expect(service.get(2026, 4)).toBeNull();
  });

  it('list ordena por ano/mês decrescente', () => {
    service.save(fakeEscala({ mes: 5, ano: 2026 }));
    service.save(fakeEscala({ mes: 4, ano: 2026 }));
    service.save(fakeEscala({ mes: 6, ano: 2026 }));
    const list = service.list().escalas;
    expect(list.map((e) => e.mes)).toEqual([6, 5, 4]);
  });

  it('save sobrescreve escala existente do mesmo mês', () => {
    service.save(fakeEscala({ origemArquivo: 'v1.xlsx' }));
    service.save(fakeEscala({ origemArquivo: 'v2.xlsx' }));
    expect(service.get(2026, 5)?.origemArquivo).toBe('v2.xlsx');
  });

  it('delete remove escala', () => {
    service.save(fakeEscala());
    expect(service.delete(2026, 5)).toBe(true);
    expect(service.get(2026, 5)).toBeNull();
  });

  it('getEscaladosDoDia retorna equipe escalada e composição', () => {
    service.save(fakeEscala());
    const r = service.getEscaladosDoDia(2026, 5, '2026-05-01');
    expect(r.equipe).toBe('C');
    expect(r.entries).toHaveLength(2);
    expect(r.entries.every((e) => e.equipe === 'C')).toBe(true);
  });

  it('getEscaladosDoDia retorna vazio quando dia não tem equipe', () => {
    service.save(fakeEscala());
    const r = service.getEscaladosDoDia(2026, 5, '2026-05-10');
    expect(r.equipe).toBeNull();
    expect(r.entries).toEqual([]);
  });

  it('getEscaladosDoDia usa composição da 2ª quinzena para dias após ultimoDiaQ1', () => {
    const composicaoQ2: ComposicaoEntry[] = [
      {
        equipe: 'C',
        viatura: 'ABTS 01',
        funcao: 'Ch',
        militar: { raw: 'CB SUBSTITUTO', postoAbreviado: 'CB', nomeGuerra: 'SUBSTITUTO' },
      },
    ];
    service.save(
      fakeEscala({
        composicaoPorQuinzena: {
          q1: composicaoBase,
          q2: composicaoQ2,
          ultimoDiaQ1: 14,
        },
      }),
    );
    const dia20 = service.getEscaladosDoDia(2026, 5, '2026-05-20');
    expect(dia20.entries).toHaveLength(1);
    expect(dia20.entries[0].militar.nomeGuerra).toBe('SUBSTITUTO');
    const dia01 = service.getEscaladosDoDia(2026, 5, '2026-05-01');
    expect(dia01.entries.find((e) => e.funcao === 'Ch')?.militar.nomeGuerra).toBe('BARCELLOS');
  });
});

describe('quinzenaDoDia', () => {
  it('resolve pelo ultimoDiaQ1 gravado na escala', () => {
    const escalaMaio = fakeEscala({
      composicaoPorQuinzena: {
        q1: composicaoBase,
        q2: composicaoBase,
        ultimoDiaQ1: 14,
      },
    });
    expect(quinzenaDoDia('2026-05-01', escalaMaio)).toBe(1);
    expect(quinzenaDoDia('2026-05-14', escalaMaio)).toBe(1);
    expect(quinzenaDoDia('2026-05-15', escalaMaio)).toBe(2);
    expect(quinzenaDoDia('2026-05-31', escalaMaio)).toBe(2);
  });

  it('corte em 13 para meses cuja aba 1 termina em 13 (ex.: junho/2026)', () => {
    const escalaJunho = fakeEscala({
      ano: 2026,
      mes: 6,
      composicaoPorQuinzena: {
        q1: composicaoBase,
        q2: composicaoBase,
        ultimoDiaQ1: 13,
      },
    });
    expect(quinzenaDoDia('2026-06-13', escalaJunho)).toBe(1);
    expect(quinzenaDoDia('2026-06-14', escalaJunho)).toBe(2);
    expect(quinzenaDoDia('2026-06-30', escalaJunho)).toBe(2);
  });
});

describe('computeDiff', () => {
  it('detecta dia que mudou de equipe', () => {
    const antes = fakeEscala();
    const depois = fakeEscala({
      diaEquipe: { ...antes.diaEquipe, '2026-05-02': 'B' },
    });
    const diff = computeDiff(antes, depois);
    expect(diff.diasAlterados).toEqual([
      { data: '2026-05-02', equipeAntes: 'D', equipeDepois: 'B' },
    ]);
  });

  it('detecta militar trocado em uma posição (q1)', () => {
    const antes = fakeEscala();
    const depois = fakeEscala({
      composicaoPorQuinzena: {
        q1: antes.composicaoPorQuinzena.q1.map((c) =>
          c.equipe === 'C' && c.funcao === 'Ch'
            ? { ...c, militar: { raw: 'CB FABRE', postoAbreviado: 'CB', nomeGuerra: 'FABRE' } }
            : c,
        ),
        q2: antes.composicaoPorQuinzena.q2,
        ultimoDiaQ1: antes.composicaoPorQuinzena.ultimoDiaQ1,
      },
    });
    const diff = computeDiff(antes, depois);
    expect(diff.composicaoAlteradaPorQuinzena.q1).toHaveLength(1);
    expect(diff.composicaoAlteradaPorQuinzena.q1[0]).toMatchObject({
      equipe: 'C',
      viatura: 'ABTS 01',
      funcao: 'Ch',
      antes: '2º SGT BARCELLOS',
      depois: 'CB FABRE',
    });
    expect(diff.composicaoAlteradaPorQuinzena.q2).toEqual([]);
  });

  it('detecta militar trocado isoladamente na 2ª quinzena', () => {
    const antes = fakeEscala();
    const depois = fakeEscala({
      composicaoPorQuinzena: {
        q1: antes.composicaoPorQuinzena.q1,
        q2: antes.composicaoPorQuinzena.q2.map((c) =>
          c.equipe === 'C' && c.funcao === 'Ch'
            ? { ...c, militar: { raw: 'CB FABRE', postoAbreviado: 'CB', nomeGuerra: 'FABRE' } }
            : c,
        ),
        ultimoDiaQ1: antes.composicaoPorQuinzena.ultimoDiaQ1,
      },
    });
    const diff = computeDiff(antes, depois);
    expect(diff.composicaoAlteradaPorQuinzena.q1).toEqual([]);
    expect(diff.composicaoAlteradaPorQuinzena.q2).toHaveLength(1);
  });

  it('retorna diff vazio quando escalas idênticas', () => {
    const escala = fakeEscala();
    const diff = computeDiff(escala, fakeEscala());
    expect(diff.diasAlterados).toEqual([]);
    expect(diff.composicaoAlteradaPorQuinzena.q1).toEqual([]);
    expect(diff.composicaoAlteradaPorQuinzena.q2).toEqual([]);
  });

  it('detecta posição removida (militar saiu)', () => {
    const antes = fakeEscala();
    const depois = fakeEscala({
      composicaoPorQuinzena: {
        q1: antes.composicaoPorQuinzena.q1.filter(
          (c) => !(c.equipe === 'C' && c.funcao === 'Op 1'),
        ),
        q2: antes.composicaoPorQuinzena.q2,
        ultimoDiaQ1: antes.composicaoPorQuinzena.ultimoDiaQ1,
      },
    });
    const diff = computeDiff(antes, depois);
    expect(diff.composicaoAlteradaPorQuinzena.q1).toEqual([
      {
        equipe: 'C',
        viatura: 'ABTS 01',
        funcao: 'Op 1',
        antes: 'SD MARTINELLI',
        depois: null,
      },
    ]);
  });
});

describe('EscalasService.updateDiaEquipe (F4)', () => {
  let service: EscalasService;
  beforeEach(() => {
    service = new EscalasService();
    service.save(fakeEscala());
  });

  it('atualiza equipe escalada de um dia', () => {
    const r = service.updateDiaEquipe(2026, 5, '2026-05-01', 'D');
    expect(r.diaEquipe['2026-05-01']).toBe('D');
  });

  it('remove dia quando equipe=null', () => {
    const r = service.updateDiaEquipe(2026, 5, '2026-05-01', null);
    expect(r.diaEquipe['2026-05-01']).toBeUndefined();
  });

  it('lança erro se mês não importado', () => {
    expect(() => service.updateDiaEquipe(2026, 11, '2026-11-01', 'A')).toThrow(/não importada/);
  });
});

describe('EscalasService.upsertComposicao (F4)', () => {
  let service: EscalasService;
  beforeEach(() => {
    service = new EscalasService();
    service.save(fakeEscala());
  });

  it('insere nova posição na 1ª quinzena', () => {
    const r = service.upsertComposicao(2026, 5, 1, {
      equipe: 'C',
      viatura: 'GUARDA',
      funcao: 'Sent. 1',
      militar: { raw: 'SD NOVO', postoAbreviado: 'SD', nomeGuerra: 'NOVO' },
    });
    const novo = r.composicaoPorQuinzena.q1.find(
      (c) => c.equipe === 'C' && c.viatura === 'GUARDA' && c.funcao === 'Sent. 1',
    );
    expect(novo?.militar.nomeGuerra).toBe('NOVO');
  });

  it('atualiza posição existente (mesma chave) na 1ª quinzena', () => {
    const r = service.upsertComposicao(2026, 5, 1, {
      equipe: 'C',
      viatura: 'ABTS 01',
      funcao: 'Ch',
      militar: { raw: 'CB SUBSTITUTO', postoAbreviado: 'CB', nomeGuerra: 'SUBSTITUTO' },
    });
    const ch = r.composicaoPorQuinzena.q1.find((c) => c.equipe === 'C' && c.funcao === 'Ch');
    expect(ch?.militar.nomeGuerra).toBe('SUBSTITUTO');
    expect(
      r.composicaoPorQuinzena.q1.filter((c) => c.equipe === 'C' && c.funcao === 'Ch'),
    ).toHaveLength(1);
  });

  it('remove posição quando militar=null', () => {
    const r = service.upsertComposicao(2026, 5, 1, {
      equipe: 'C',
      viatura: 'ABTS 01',
      funcao: 'Ch',
      militar: null,
    });
    expect(
      r.composicaoPorQuinzena.q1.find((c) => c.equipe === 'C' && c.funcao === 'Ch'),
    ).toBeUndefined();
  });

  it('upsert na 2ª quinzena não toca a 1ª', () => {
    const antes = service.get(2026, 5)!;
    const r = service.upsertComposicao(2026, 5, 2, {
      equipe: 'C',
      viatura: 'ABTS 01',
      funcao: 'Ch',
      militar: { raw: 'CB SUBSTITUTO 2Q', postoAbreviado: 'CB', nomeGuerra: 'SUBSTITUTO 2Q' },
    });
    expect(r.composicaoPorQuinzena.q1).toEqual(antes.composicaoPorQuinzena.q1);
    const ch2 = r.composicaoPorQuinzena.q2.find((c) => c.equipe === 'C' && c.funcao === 'Ch');
    expect(ch2?.militar.nomeGuerra).toBe('SUBSTITUTO 2Q');
  });
});

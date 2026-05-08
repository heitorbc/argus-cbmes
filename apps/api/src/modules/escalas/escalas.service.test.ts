import { describe, it, expect, beforeEach } from 'vitest';
import type { EscalaMensal } from '@argus/shared-types';
import { EscalasService, computeDiff } from './escalas.service';

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
    },
    composicao: [
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
    ],
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

  it('detecta militar trocado em uma posição', () => {
    const antes = fakeEscala();
    const depois = fakeEscala({
      composicao: antes.composicao.map((c) =>
        c.equipe === 'C' && c.funcao === 'Ch'
          ? { ...c, militar: { raw: 'CB FABRE', postoAbreviado: 'CB', nomeGuerra: 'FABRE' } }
          : c,
      ),
    });
    const diff = computeDiff(antes, depois);
    expect(diff.composicaoAlterada).toHaveLength(1);
    expect(diff.composicaoAlterada[0]).toMatchObject({
      equipe: 'C',
      viatura: 'ABTS 01',
      funcao: 'Ch',
      antes: '2º SGT BARCELLOS',
      depois: 'CB FABRE',
    });
  });

  it('retorna diff vazio quando escalas idênticas', () => {
    const escala = fakeEscala();
    const diff = computeDiff(escala, fakeEscala());
    expect(diff.diasAlterados).toEqual([]);
    expect(diff.composicaoAlterada).toEqual([]);
  });

  it('detecta posição removida (militar saiu)', () => {
    const antes = fakeEscala();
    const depois = fakeEscala({
      composicao: antes.composicao.filter((c) => !(c.equipe === 'C' && c.funcao === 'Op 1')),
    });
    const diff = computeDiff(antes, depois);
    expect(diff.composicaoAlterada).toEqual([
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

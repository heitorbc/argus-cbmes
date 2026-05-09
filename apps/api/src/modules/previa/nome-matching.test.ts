import { describe, it, expect } from 'vitest';
import type { Militar, MilitarRef } from '@argus/shared-types';
import { NomeMatcher } from './nome-matching';

function militar(overrides: Partial<Militar> & { nf: string; nome: string }): Militar {
  return {
    nf: overrides.nf,
    ant: overrides.ant ?? 100,
    posto: overrides.posto ?? 'CB',
    nome: overrides.nome,
    nomeGuerra: overrides.nomeGuerra,
    ...overrides,
  };
}

function ref(postoAbreviado: string, nomeGuerra: string): MilitarRef {
  return { raw: `${postoAbreviado} ${nomeGuerra}`, postoAbreviado, nomeGuerra };
}

describe('NomeMatcher', () => {
  const efetivo: Militar[] = [
    militar({
      nf: '3037509',
      posto: '2ºSGT',
      nome: 'HEITOR BARCELLOS COELHO',
      nomeGuerra: 'BARCELLOS',
      ant: 418,
    }),
    militar({
      nf: '4750241',
      posto: 'SD',
      nome: 'FERNANDA FONSECA MARTINELLI',
      nomeGuerra: 'MARTINELLI',
      ant: 1095,
    }),
    militar({
      nf: '2982390',
      posto: '2ºSGT',
      nome: 'DANIEL DE AMORIM MATTOS',
      nomeGuerra: 'D. MATTOS',
      ant: 366,
    }),
    militar({ nf: '3055566', posto: 'CB', nome: 'EDSON FABRE', nomeGuerra: 'FABRE', ant: 800 }),
    militar({
      nf: '4750713',
      posto: 'SD',
      nome: 'CAUE LYRA CASTRO',
      nomeGuerra: 'CAUÊ LYRA',
      ant: 1200,
    }),
  ];

  const matcher = new NomeMatcher(efetivo);

  it('resolve match exato posto + nomeGuerra', () => {
    const r = matcher.resolve(ref('2º SGT', 'BARCELLOS'));
    expect(r.resolved?.nf).toBe('3037509');
    expect(r.ambiguidade).toBe(false);
  });

  it('resolve quando posto tem espaço extra ("2º SGT" vs "2ºSGT")', () => {
    expect(matcher.resolve(ref('2ºSGT', 'BARCELLOS')).resolved?.nf).toBe('3037509');
    expect(matcher.resolve(ref('2º SGT', 'BARCELLOS')).resolved?.nf).toBe('3037509');
  });

  it('resolve "CB FABRE" sem ambiguidade', () => {
    expect(matcher.resolve(ref('CB', 'FABRE')).resolved?.nf).toBe('3055566');
  });

  it('resolve nomes com pontuação ("D. MATTOS" → MATTOS)', () => {
    const r = matcher.resolve(ref('2º SGT', 'D. MATTOS'));
    expect(r.resolved?.nf).toBe('2982390');
  });

  it('resolve nome com acento ("CAUÊ LYRA")', () => {
    const r = matcher.resolve(ref('SD', 'CAUE LYRA'));
    expect(r.resolved?.nf).toBe('4750713');
  });

  it('retorna null quando militar não está no efetivo', () => {
    const r = matcher.resolve(ref('CB', 'FULANO INEXISTENTE'));
    expect(r.resolved).toBeNull();
    expect(r.ambiguidade).toBe(false);
  });

  it('marca ambiguidade quando 2+ militares com mesmo nomeGuerra', () => {
    const efetivoDup: Militar[] = [
      militar({ nf: '111', posto: 'CB', nome: 'A SILVA', nomeGuerra: 'SILVA' }),
      militar({ nf: '222', posto: 'SD', nome: 'B SILVA', nomeGuerra: 'SILVA' }),
    ];
    const m = new NomeMatcher(efetivoDup);
    const r = m.resolve(ref('CB', 'SILVA'));
    // O index byPostoNome resolve por posto exato; aqui CB|SILVA tem 1 match único.
    expect(r.resolved?.nf).toBe('111');
    // Mas só com nomeGuerra (sem posto): ambíguo.
    const r2 = m.resolve({ raw: 'SILVA', postoAbreviado: '', nomeGuerra: 'SILVA' });
    expect(r2.ambiguidade).toBe(true);
    expect(r2.resolved).toBeNull();
  });

  it('retorna null sem alterações quando militarRef já tem NF', () => {
    const r = matcher.resolve({
      raw: '2º SGT BARCELLOS',
      postoAbreviado: '2ºSGT',
      nomeGuerra: 'BARCELLOS',
      nf: '3037509',
    });
    // Política conservadora: parser não passa nf no S3b — esse path é defensivo.
    expect(r.resolved).toBeNull();
  });
});

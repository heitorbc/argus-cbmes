import { describe, it, expect } from 'vitest';
import type { Recurso } from '@argus/shared-types';
import { validarComposicaoRecurso } from './recurso-composition-validator';

function makeRecurso(over: Partial<Recurso> = {}): Recurso {
  return {
    id: 'r:1',
    unidadeId: 'u:1',
    nome: 'ABTS_01',
    categoria: 'OPERACIONAL',
    ativo: true,
    comportaViatura: true,
    comportaEfetivo: true,
    tipoComposicao: 'viatura_e_equipe',
    equipeMinima: [
      { funcao: 'chefe', obrigatorio: true },
      { funcao: 'motorista', obrigatorio: true },
      { funcao: 'operador', obrigatorio: true },
    ],
    viaturaPrefixoFixo: null,
    ordem: 1,
    criadoEm: '2026-05-28T00:00:00Z',
    atualizadoEm: '2026-05-28T00:00:00Z',
    ...over,
  };
}

describe('validarComposicaoRecurso (S2.13b)', () => {
  it('viatura_only ignora equipe (sempre ok)', () => {
    const r = makeRecurso({ tipoComposicao: 'viatura_only', equipeMinima: null });
    const v = validarComposicaoRecurso(r, []);
    expect(v.ok).toBe(true);
    expect(v.erros).toEqual([]);
  });

  it('equipeMinima null com tipoComposicao viatura_e_equipe é ok (recurso sem regra)', () => {
    const r = makeRecurso({ equipeMinima: null });
    const v = validarComposicaoRecurso(r, []);
    expect(v.ok).toBe(true);
  });

  it('equipeMinima vazia ([]) é ok (sem regra)', () => {
    const r = makeRecurso({ equipeMinima: [] });
    const v = validarComposicaoRecurso(r, []);
    expect(v.ok).toBe(true);
  });

  it('todos os obrigatórios presentes → ok', () => {
    const v = validarComposicaoRecurso(makeRecurso(), [
      { funcao: 'chefe', militarRaw: 'X' },
      { funcao: 'motorista', militarRaw: 'Y' },
      { funcao: 'operador', militarRaw: 'Z' },
    ]);
    expect(v.ok).toBe(true);
  });

  it('falta uma função obrigatória → erro listado', () => {
    const v = validarComposicaoRecurso(makeRecurso(), [
      { funcao: 'chefe', militarRaw: 'X' },
      { funcao: 'motorista', militarRaw: 'Y' },
      // sem operador
    ]);
    expect(v.ok).toBe(false);
    expect(v.erros).toHaveLength(1);
    expect(v.erros[0]).toMatch(/operador/i);
  });

  it('função opcional ausente → ok (não bloqueia)', () => {
    const r = makeRecurso({
      equipeMinima: [
        { funcao: 'chefe', obrigatorio: true },
        { funcao: 'motorista', obrigatorio: true },
        { funcao: 'operador 2', obrigatorio: false },
      ],
    });
    const v = validarComposicaoRecurso(r, [
      { funcao: 'chefe', militarRaw: 'X' },
      { funcao: 'motorista', militarRaw: 'Y' },
    ]);
    expect(v.ok).toBe(true);
  });

  it('podeAcumularCom: chefe ausente mas mesma posição preenchida via motorista → ok', () => {
    const r = makeRecurso({
      equipeMinima: [
        { funcao: 'chefe', obrigatorio: true, podeAcumularCom: ['motorista'] },
        { funcao: 'motorista', obrigatorio: true, podeAcumularCom: ['chefe'] },
        { funcao: 'socorrista', obrigatorio: true },
      ],
    });
    const v = validarComposicaoRecurso(r, [
      // 1 militar preenche motorista (e por acumulação cobre chefe)
      { funcao: 'motorista', militarRaw: 'X' },
      { funcao: 'socorrista', militarRaw: 'Y' },
    ]);
    expect(v.ok).toBe(true);
  });

  it('podeAcumularCom mas alvo também ausente → erro', () => {
    const r = makeRecurso({
      equipeMinima: [
        { funcao: 'chefe', obrigatorio: true, podeAcumularCom: ['motorista'] },
        { funcao: 'socorrista', obrigatorio: true },
      ],
    });
    const v = validarComposicaoRecurso(r, [{ funcao: 'socorrista', militarRaw: 'X' }]);
    expect(v.ok).toBe(false);
    expect(v.erros[0]).toMatch(/chefe/i);
    expect(v.erros[0]).toMatch(/motorista/i);
  });

  it('case-insensitive + tolerante a whitespace na função', () => {
    const v = validarComposicaoRecurso(makeRecurso(), [
      { funcao: '  CHEFE  ', militarRaw: 'X' },
      { funcao: 'Motorista', militarRaw: 'Y' },
      { funcao: 'OPERADOR', militarRaw: 'Z' },
    ]);
    expect(v.ok).toBe(true);
  });

  it('GUARDA com 3 sentinelas distintos: todos preenchidos → ok', () => {
    const r = makeRecurso({
      nome: 'GUARDA',
      tipoComposicao: 'equipe_only',
      categoria: 'GUARDA',
      equipeMinima: [
        { funcao: 'sentinela 1', obrigatorio: true },
        { funcao: 'sentinela 2', obrigatorio: true },
        { funcao: 'sentinela 3', obrigatorio: true },
      ],
    });
    const v = validarComposicaoRecurso(r, [
      { funcao: 'sentinela 1', militarRaw: 'A' },
      { funcao: 'sentinela 2', militarRaw: 'B' },
      { funcao: 'sentinela 3', militarRaw: 'C' },
    ]);
    expect(v.ok).toBe(true);
  });
});

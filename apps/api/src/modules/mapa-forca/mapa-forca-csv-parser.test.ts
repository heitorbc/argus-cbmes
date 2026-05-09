import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { parseMapaForcaCsv } from './mapa-forca-csv-parser';

const FIXTURE = resolve(__dirname, '__fixtures__', 'mapa-forca-2026-05-08.csv');

function loadFixture(): string {
  return readFileSync(FIXTURE, 'utf8');
}

describe('parseMapaForcaCsv', () => {
  it('extrai os recursos da 1ª Cia ignorando 2ª Cia e EQUIPAMENTOS', () => {
    const csv = loadFixture();
    const r = parseMapaForcaCsv(csv);
    // Deve ter por volta de 18-21 recursos válidos da 1ª Cia, nunca os blocos seguintes.
    expect(r.recursos.length).toBeGreaterThanOrEqual(15);
    expect(r.recursos.length).toBeLessThanOrEqual(21);
    // Garante que recursos da 2ª Cia (que vêm depois) NÃO foram incluídos.
    const recursos = r.recursos.map((x) => x.recurso);
    // Não há rows duplicados (cada recurso aparece 1 vez no bloco da 1ª Cia).
    expect(new Set(recursos).size).toBe(recursos.length);
  });

  it('inclui MERGULHO 01 e MERGULHO 02', () => {
    const csv = loadFixture();
    const r = parseMapaForcaCsv(csv);
    const mergulhos = r.recursos.filter((x) => x.recurso.startsWith('MERGULHO'));
    expect(mergulhos).toHaveLength(2);
    const m02 = mergulhos.find((x) => x.recurso === 'MERGULHO 02');
    expect(m02?.vtrPrefixo).toBe('AM_002');
    expect(m02?.vtrStatus).toBe('DISPONIVEL');
    // MERGULHO 02 do snapshot tem 3 militares: chefe + mot + 1 operador
    expect(m02?.chefe).toContain('ALEXANDRE');
    expect(m02?.motorista).toContain('VAZ');
    expect(m02?.operadores.length).toBeGreaterThanOrEqual(1);
  });

  it('ABTS_01 com viatura ABTS_011 disponível e 3 militares', () => {
    const csv = loadFixture();
    const r = parseMapaForcaCsv(csv);
    const abts1 = r.recursos.find((x) => x.recurso === 'ABTS_01');
    expect(abts1).toBeDefined();
    expect(abts1!.vtrPrefixo).toBe('ABTS_011');
    expect(abts1!.vtrStatus).toBe('DISPONIVEL');
    expect(abts1!.chefe).toContain('JARDEL');
    expect(abts1!.motorista).toContain('HENRIQUE');
    expect(abts1!.operadores.length).toBeGreaterThanOrEqual(1);
  });

  it('GUARDA tem 3 sentinelas em operadores e sem chefe/motorista', () => {
    const csv = loadFixture();
    const r = parseMapaForcaCsv(csv);
    const guarda = r.recursos.find((x) => x.recurso === 'GUARDA');
    expect(guarda).toBeDefined();
    // GUARDA não tem viatura própria
    expect(guarda!.vtrStatus).toBeNull();
    // 3 sentinelas em ops (cols G/H/I do CSV) — sem chefe/motorista
    expect(guarda!.chefe).toBeUndefined();
    expect(guarda!.motorista).toBeUndefined();
    expect(guarda!.operadores).toHaveLength(3);
  });

  it('detecta viatura BAIXADA (PLATAFORMA / TE_110 no snapshot)', () => {
    const csv = loadFixture();
    const r = parseMapaForcaCsv(csv);
    const plat = r.recursos.find((x) => x.recurso === 'PLATAFORMA');
    expect(plat).toBeDefined();
    expect(plat!.vtrPrefixo).toBe('TE_110');
    expect(plat!.vtrStatus).toBe('BAIXADA');
    expect(plat!.semEquipe).toBe(true);
  });

  it('extrai Fiscal do Dia da linha 5', () => {
    const csv = loadFixture();
    const r = parseMapaForcaCsv(csv);
    expect(r.fiscalDoDia).toContain('MARIANE');
  });

  it('aceita CSV truncado sem explodir (apenas retorna o que conseguiu)', () => {
    const r = parseMapaForcaCsv('linha lixo,sem header\nrandom,data\n');
    expect(r.recursos).toEqual([]);
    expect(r.fiscalDoDia).toBeUndefined();
  });
});

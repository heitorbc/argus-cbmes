import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { parseQdiDadosCsv } from './qdi-dados-csv-parser';

const FIXTURE = resolve(__dirname, '__fixtures__', 'qdi-dados-2026-05-09.csv');

function loadFixture(): string {
  return readFileSync(FIXTURE, 'utf8');
}

describe('parseQdiDadosCsv', () => {
  it('S2.10.13b: default sem filtro retorna TODAS as unidades do CBMES', () => {
    const csv = loadFixture();
    const militares = parseQdiDadosCsv(csv);
    // CBMES inteiro: muito mais que apenas 1ª Cia
    expect(militares.length).toBeGreaterThan(500);
    // Várias lotações presentes (CG, CEPDEC, DAL, 1ª1º, 2ª1º, etc.)
    const lotacoesUnicas = new Set(militares.map((m) => m.lotacao).filter(Boolean));
    expect(lotacoesUnicas.size).toBeGreaterThan(1);
  });

  it('passa filtro ["1ª1º"] explicitamente → apenas militares da 1ª Cia', () => {
    const csv = loadFixture();
    const militares = parseQdiDadosCsv(csv, ['1ª1º', '1ª/1º']);
    expect(militares.length).toBeGreaterThan(50);
    expect(militares.length).toBeLessThan(150);
    // Todos têm lotacao "1ª1º"
    expect(militares.every((m) => m.lotacao === '1ª1º' || m.lotacao === '1ª/1º')).toBe(true);
  });

  it('inclui BARCELLOS (NF 3037509) com dados completos', () => {
    const csv = loadFixture();
    const militares = parseQdiDadosCsv(csv);
    const barcellos = militares.find((m) => m.nf === '3037509');
    expect(barcellos).toBeDefined();
    expect(barcellos!.posto).toContain('SGT');
    expect(barcellos!.nomeGuerra).toBe('BARCELLOS');
    expect(barcellos!.nome).toContain('BARCELLOS');
    expect(barcellos!.lotacao).toBe('1ª1º');
    expect(barcellos!.classe).toBeDefined();
  });

  it('inclui SARGENTEANTE D. MATTOS (NF 2982390)', () => {
    const csv = loadFixture();
    const militares = parseQdiDadosCsv(csv);
    const mattos = militares.find((m) => m.nf === '2982390');
    expect(mattos).toBeDefined();
    expect(mattos!.posto).toContain('SGT');
    expect(mattos!.nome).toContain('MATTOS');
  });

  it('extrai pontos disciplinares quando presentes', () => {
    const csv = loadFixture();
    // Mantém filtro 1ª Cia para preservar contrato do teste anterior:
    // dados de pontos da 1ª Cia ficam dentro do range 0-100.
    const militares = parseQdiDadosCsv(csv, ['1ª1º', '1ª/1º']);
    const comPontos = militares.filter((m) => m.pontos !== undefined);
    expect(comPontos.length).toBeGreaterThan(10);
    expect(comPontos.every((m) => m.pontos! >= 0 && m.pontos! <= 100)).toBe(true);
  });

  it('captura CNH e validade quando presentes', () => {
    const csv = loadFixture();
    const militares = parseQdiDadosCsv(csv);
    const comCnh = militares.filter((m) => m.cnh && m.cnhValidade);
    expect(comCnh.length).toBeGreaterThan(20);
  });

  it('respeita filtro customizado de locais', () => {
    const csv = loadFixture();
    const apenasInexistente = parseQdiDadosCsv(csv, ['INEXISTENTE']);
    expect(apenasInexistente).toEqual([]);
  });

  it('rejeita CSV vazio sem explodir', () => {
    expect(parseQdiDadosCsv('')).toEqual([]);
    expect(parseQdiDadosCsv('linha sem header,sem dados\n')).toEqual([]);
  });
});

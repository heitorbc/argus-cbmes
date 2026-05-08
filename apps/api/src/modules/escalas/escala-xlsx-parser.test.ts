import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  EscalaXlsxParseError,
  parseEscalaXlsx,
  parseFilename,
  parseMilitarCell,
} from './escala-xlsx-parser';

const FIXTURES_DIR = resolve(__dirname, '..', '..', '..', '..', '..', 'data', 'Escala de Serviço');

function loadFixture(filename: string): Buffer {
  return readFileSync(resolve(FIXTURES_DIR, filename));
}

describe('parseFilename', () => {
  it('reconhece nomes padrão "MM MES DE AAAA"', () => {
    expect(parseFilename('05 MAIO DE 2026.xlsx')).toEqual({ mes: 5, ano: 2026 });
    expect(parseFilename('04 ABRIL DE 2026.xlsx')).toEqual({ mes: 4, ano: 2026 });
    expect(parseFilename('06 JUNHO DE 2026.xlsx')).toEqual({ mes: 6, ano: 2026 });
    expect(parseFilename('03 MARÇO DE 2026.xlsx')).toEqual({ mes: 3, ano: 2026 });
  });

  it('aceita variantes mid-month/parcial preservando mês', () => {
    expect(parseFilename('02 FEVEREIRO DE 2026 - apos mergulho voltar.xlsx')).toEqual({
      mes: 2,
      ano: 2026,
    });
    expect(parseFilename('05 MAIO DE 2026 11 A 15.xlsx')).toEqual({ mes: 5, ano: 2026 });
  });

  it('rejeita arquivos sem mês reconhecível', () => {
    expect(() => parseFilename('PROVA CHS.xlsx')).toThrow(EscalaXlsxParseError);
    expect(() => parseFilename('dia da mulher.xlsx')).toThrow(EscalaXlsxParseError);
  });

  it('rejeita arquivos sem ano', () => {
    expect(() => parseFilename('MAIO sem ano.xlsx')).toThrow(EscalaXlsxParseError);
  });
});

describe('parseMilitarCell', () => {
  it('reconhece padrão posto+nomeGuerra', () => {
    expect(parseMilitarCell('2º SGT JULIO')).toMatchObject({
      postoAbreviado: '2ºSGT',
      nomeGuerra: 'JULIO',
    });
    expect(parseMilitarCell('CB FABRE')).toMatchObject({
      postoAbreviado: 'CB',
      nomeGuerra: 'FABRE',
    });
    expect(parseMilitarCell('SD MARTINELLI')).toMatchObject({
      postoAbreviado: 'SD',
      nomeGuerra: 'MARTINELLI',
    });
    expect(parseMilitarCell('1º SGT HEVERTON')).toMatchObject({
      postoAbreviado: '1ºSGT',
      nomeGuerra: 'HEVERTON',
    });
  });

  it('descarta células vazias e placeholders', () => {
    expect(parseMilitarCell('')).toBeNull();
    expect(parseMilitarCell('--')).toBeNull();
    expect(parseMilitarCell('-')).toBeNull();
  });

  it('preserva nomes compostos no campo nomeGuerra', () => {
    expect(parseMilitarCell('CB ANDRE LUIS')).toMatchObject({
      postoAbreviado: 'CB',
      nomeGuerra: 'ANDRE LUIS',
    });
  });
});

describe('parseEscalaXlsx (fixture: 05 MAIO 2026)', () => {
  it('reconhece estrutura canônica com 4 equipes e dias 1-29', async () => {
    const buffer = loadFixture('05 MAIO DE 2026.xlsx');
    const escala = await parseEscalaXlsx({
      buffer,
      filename: '05 MAIO DE 2026.xlsx',
    });
    expect(escala.mes).toBe(5);
    expect(escala.ano).toBe(2026);

    // 14 + 15 = 29 dias, ou um pouco menos se algum dia ficou sem letra
    const dias = Object.keys(escala.diaEquipe);
    expect(dias.length).toBeGreaterThanOrEqual(20);

    // Equipes presentes
    const equipes = new Set(Object.values(escala.diaEquipe));
    expect(equipes.has('A')).toBe(true);
    expect(equipes.has('B')).toBe(true);
    expect(equipes.has('C')).toBe(true);
    expect(equipes.has('D')).toBe(true);
  });

  it('extrai composição de equipe CHARLIE com BARCELLOS como Ch ABTS', async () => {
    const buffer = loadFixture('05 MAIO DE 2026.xlsx');
    const escala = await parseEscalaXlsx({ buffer, filename: '05 MAIO DE 2026.xlsx' });

    const charlie = escala.composicao.filter((c) => c.equipe === 'C');
    expect(charlie.length).toBeGreaterThan(0);

    const chAbts = charlie.find((c) => /ABTS/i.test(c.viatura) && /^Ch$/i.test(c.funcao.trim()));
    expect(chAbts).toBeDefined();
    expect(chAbts!.militar.nomeGuerra).toMatch(/BARCELL/);
  });

  it('extrai composição de equipe ALFA com FABRE como Op 1 ABTS', async () => {
    const buffer = loadFixture('05 MAIO DE 2026.xlsx');
    const escala = await parseEscalaXlsx({ buffer, filename: '05 MAIO DE 2026.xlsx' });

    const alfa = escala.composicao.filter((c) => c.equipe === 'A');
    const op1 = alfa.find((c) => /ABTS/i.test(c.viatura) && /Op\s*1/i.test(c.funcao));
    expect(op1).toBeDefined();
    expect(op1!.militar.nomeGuerra).toBe('FABRE');
  });
});

describe('parseEscalaXlsx (fixture: 04 ABRIL 2026)', () => {
  it('reconhece estrutura mensal sem erros', async () => {
    const buffer = loadFixture('04 ABRIL DE 2026.xlsx');
    const escala = await parseEscalaXlsx({ buffer, filename: '04 ABRIL DE 2026.xlsx' });
    expect(escala.mes).toBe(4);
    expect(escala.ano).toBe(2026);
    expect(Object.keys(escala.diaEquipe).length).toBeGreaterThanOrEqual(20);
    expect(escala.composicao.length).toBeGreaterThan(20);
  });
});

describe('parseEscalaXlsx (fixture: 06 JUNHO 2026)', () => {
  it('reconhece estrutura mensal sem erros', async () => {
    const buffer = loadFixture('06 JUNHO DE 2026.xlsx');
    const escala = await parseEscalaXlsx({ buffer, filename: '06 JUNHO DE 2026.xlsx' });
    expect(escala.mes).toBe(6);
    expect(escala.ano).toBe(2026);
    expect(Object.keys(escala.diaEquipe).length).toBeGreaterThanOrEqual(20);
  });
});

describe('parseEscalaXlsx — rejeição de não-escalas', () => {
  it('rejeita PROVA CHS.xlsx pelo nome', async () => {
    const buffer = loadFixture('PROVA CHS.xlsx');
    await expect(parseEscalaXlsx({ buffer, filename: 'PROVA CHS.xlsx' })).rejects.toThrow(
      /não contém/,
    );
  });

  it('rejeita "dia da mulher.xlsx" pelo nome', async () => {
    const buffer = loadFixture('dia da mulher.xlsx');
    await expect(parseEscalaXlsx({ buffer, filename: 'dia da mulher.xlsx' })).rejects.toThrow(
      /não contém/,
    );
  });
});

describe('parseEscalaXlsx — reupload parcial', () => {
  it('05 MAIO 11 A 15 também é parseado e retorna mes=5/ano=2026', async () => {
    const buffer = loadFixture('05 MAIO DE 2026 11 A 15.xlsx');
    const escala = await parseEscalaXlsx({
      buffer,
      filename: '05 MAIO DE 2026 11 A 15.xlsx',
    });
    expect(escala.mes).toBe(5);
    expect(escala.ano).toBe(2026);
  });
});

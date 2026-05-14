import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ExcelJS from 'exceljs';
import { describe, it, expect } from 'vitest';
import {
  EscalaEspecialParseError,
  parseEscalaEspecialXlsm,
  parseFilenameEspecial,
  splitMilitaresRaw,
} from './escala-especial-xlsm-parser';

const FIXTURE = resolve(__dirname, '__fixtures__', '05 - ESCALA ESPECIAL 1ª CIA - MAIO.xlsm');

function loadFixture(): Buffer {
  return readFileSync(FIXTURE);
}

describe('parseFilenameEspecial', () => {
  it('reconhece padrão "MM - ESCALA ESPECIAL ... - MES"', () => {
    expect(parseFilenameEspecial('05 - ESCALA ESPECIAL 1ª CIA - MAIO.xlsm')).toEqual({
      mes: 5,
      ano: expect.any(Number),
    });
    expect(parseFilenameEspecial('01 - ESCALA ESPECIAL - JANEIRO 2026.xlsm')).toEqual({
      mes: 1,
      ano: 2026,
    });
  });

  it('rejeita arquivos sem "ESCALA ESPECIAL" no nome', () => {
    expect(() => parseFilenameEspecial('PROVA CHS.xlsm')).toThrow(EscalaEspecialParseError);
    expect(() => parseFilenameEspecial('escala-mensal.xlsx')).toThrow(EscalaEspecialParseError);
  });
});

describe('parseEscalaEspecialXlsm (fixture: 05 MAIO 2026)', () => {
  it('extrai atos com militar/horário/data/função', async () => {
    const buffer = loadFixture();
    const r = await parseEscalaEspecialXlsm({
      buffer,
      filename: '05 - ESCALA ESPECIAL 1ª CIA - MAIO.xlsm',
    });
    expect(r.escala.mes).toBe(5);
    expect(r.escala.atos.length).toBeGreaterThan(10);
    // Cada ato tem todos os campos obrigatórios preenchidos
    for (const a of r.escala.atos) {
      expect(a.militarRaw).toBeTruthy();
      expect(a.horario).toBeTruthy();
      expect(a.data).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(a.funcao).toBeTruthy();
    }
  });

  it('descarta atos com militar = "XXX" (turno vago)', async () => {
    const buffer = loadFixture();
    const r = await parseEscalaEspecialXlsm({
      buffer,
      filename: '05 - ESCALA ESPECIAL 1ª CIA - MAIO.xlsm',
    });
    expect(r.descartados).toBeGreaterThan(0);
    expect(r.escala.atos.every((a) => a.militarRaw !== 'XXX')).toBe(true);
  });

  it('inclui SGT MARIANE 07:10-13:10 em 2026-05-01 (primeiro ato)', async () => {
    const buffer = loadFixture();
    const r = await parseEscalaEspecialXlsm({
      buffer,
      filename: '05 - ESCALA ESPECIAL 1ª CIA - MAIO.xlsm',
    });
    const primeiro = r.escala.atos.find(
      (a) => a.data === '2026-05-01' && a.militarRaw.includes('MARIANE'),
    );
    expect(primeiro).toBeDefined();
    expect(primeiro!.horario).toContain('07:10');
    expect(primeiro!.funcao).toBe('APOIO');
  });

  it('rejeita arquivo sem "ESCALA ESPECIAL" no nome', async () => {
    const buffer = loadFixture();
    await expect(parseEscalaEspecialXlsm({ buffer, filename: 'PROVA CHS.xlsx' })).rejects.toThrow(
      EscalaEspecialParseError,
    );
  });
});

describe('splitMilitaresRaw', () => {
  it('devolve 1 entrada quando não há separador', () => {
    expect(splitMilitaresRaw('SGT MARIANE')).toEqual(['SGT MARIANE']);
  });

  it('divide em 2 quando há "/" (caso institucional do Sargenteante)', () => {
    expect(splitMilitaresRaw('SGT HEVERTON/ CB GODOY')).toEqual(['SGT HEVERTON', 'CB GODOY']);
    expect(splitMilitaresRaw('SGT GASTALDI/ CB LAUF')).toEqual(['SGT GASTALDI', 'CB LAUF']);
    expect(splitMilitaresRaw('CB ANDRÉ LUIS/ CB BERGI')).toEqual(['CB ANDRÉ LUIS', 'CB BERGI']);
  });

  it('divide em 3+ militares sem limite artificial', () => {
    expect(splitMilitaresRaw('A / B / C')).toEqual(['A', 'B', 'C']);
  });

  it('aplica trim de espaços extras', () => {
    expect(splitMilitaresRaw('  SGT A  /  CB B  ')).toEqual(['SGT A', 'CB B']);
  });

  it('devolve [] em casos malformados (parte vazia)', () => {
    expect(splitMilitaresRaw('A//')).toEqual([]);
    expect(splitMilitaresRaw('/A')).toEqual([]);
    expect(splitMilitaresRaw('A/  /B')).toEqual([]);
  });

  it('devolve [] quando string é vazia / só espaços', () => {
    expect(splitMilitaresRaw('')).toEqual([]);
    expect(splitMilitaresRaw('   ')).toEqual([]);
  });
});

/**
 * Gera um XLSM em memória com a aba "Modelo Aviso - Especial" e uma tabela
 * com cabeçalho MILITAR/HORÁRIO/DATA/FUNÇÃO + linhas customizáveis. Usado
 * para testar variações de célula que não estão no fixture institucional.
 */
async function buildSyntheticXlsm(
  linhas: Array<{ militar: string; horario: string; data: string; funcao: string }>,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Modelo Aviso - Especial');
  ws.getRow(1).values = ['MILITAR', 'HORÁRIO', 'DATA', 'FUNÇÃO'];
  linhas.forEach((l, i) => {
    ws.getRow(2 + i).values = [l.militar, l.horario, l.data, l.funcao];
  });
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

describe('parseEscalaEspecialXlsm — split de militares por "/"', () => {
  it('expande 1 célula com 2 militares em 2 atos (mesmo horário/data/função)', async () => {
    const buffer = await buildSyntheticXlsm([
      {
        militar: 'SGT HEVERTON/ CB GODOY',
        horario: '07:10 ÀS 13:10',
        data: '2026-05-11',
        funcao: 'APOIO',
      },
    ]);
    const r = await parseEscalaEspecialXlsm({
      buffer,
      filename: '05 - ESCALA ESPECIAL 1ª CIA - MAIO.xlsm',
    });
    expect(r.escala.atos).toHaveLength(2);
    expect(r.escala.atos.map((a) => a.militarRaw)).toEqual(['SGT HEVERTON', 'CB GODOY']);
    for (const a of r.escala.atos) {
      expect(a.data).toBe('2026-05-11');
      expect(a.horario).toBe('07:10 ÀS 13:10');
      expect(a.funcao).toBe('APOIO');
    }
    expect(r.escala.avisos).toEqual([]);
  });

  it('expande 1+2+3 = 6 atos quando linhas mistas (sem "/", 2 e 3 militares)', async () => {
    const buffer = await buildSyntheticXlsm([
      { militar: 'SGT MARIANE', horario: '07:10 ÀS 13:10', data: '2026-05-01', funcao: 'APOIO' },
      {
        militar: 'SGT GASTALDI/ CB LAUF',
        horario: '07:10 ÀS 13:10',
        data: '2026-05-12',
        funcao: 'APOIO',
      },
      {
        militar: 'CB A/ CB B/ CB C',
        horario: '13:10 ÀS 19:10',
        data: '2026-05-13',
        funcao: 'APOIO',
      },
    ]);
    const r = await parseEscalaEspecialXlsm({
      buffer,
      filename: '05 - ESCALA ESPECIAL 1ª CIA - MAIO.xlsm',
    });
    expect(r.escala.atos).toHaveLength(6);
    expect(r.escala.atos.filter((a) => a.data === '2026-05-12')).toHaveLength(2);
    expect(r.escala.atos.filter((a) => a.data === '2026-05-13')).toHaveLength(3);
    expect(r.escala.avisos).toEqual([]);
  });

  it('mantém raw e gera aviso quando célula tem "/" malformado', async () => {
    const buffer = await buildSyntheticXlsm([
      {
        militar: 'SGT A//',
        horario: '07:10 ÀS 13:10',
        data: '2026-05-15',
        funcao: 'APOIO',
      },
    ]);
    const r = await parseEscalaEspecialXlsm({
      buffer,
      filename: '05 - ESCALA ESPECIAL 1ª CIA - MAIO.xlsm',
    });
    expect(r.escala.atos).toHaveLength(1);
    expect(r.escala.atos[0]!.militarRaw).toBe('SGT A//');
    expect(r.escala.avisos.some((a) => /malformado/.test(a))).toBe(true);
  });
});

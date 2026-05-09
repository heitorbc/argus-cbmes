import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  EscalaEspecialParseError,
  parseEscalaEspecialXlsm,
  parseFilenameEspecial,
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

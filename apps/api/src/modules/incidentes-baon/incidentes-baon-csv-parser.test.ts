import { describe, it, expect } from 'vitest';
import { parseIncidentesBaonCsv } from './incidentes-baon-csv-parser';

describe('parseIncidentesBaonCsv', () => {
  it('parseia header + 3 linhas com separador ; (com BOM)', () => {
    const BOM = '﻿';
    const csv =
      BOM +
      'CODIGO;DESCRICAO;CLASSIFICACAO\n' +
      'Q;INCENDIO;CRIMINAL\n' +
      'Q01;INCENDIO: EM RESIDENCIA;CRIMINAL\n' +
      'M01E;ATENDIMENTO PRÉ-HOSPITALAR;RESGATE\n';
    const items = parseIncidentesBaonCsv(csv);
    expect(items).toEqual([
      { codigo: 'Q', descricao: 'INCENDIO', classificacao: 'CRIMINAL' },
      { codigo: 'Q01', descricao: 'INCENDIO: EM RESIDENCIA', classificacao: 'CRIMINAL' },
      { codigo: 'M01E', descricao: 'ATENDIMENTO PRÉ-HOSPITALAR', classificacao: 'RESGATE' },
    ]);
  });

  it('aceita CSV sem header (1ª linha já é dado)', () => {
    const csv = `Q;INCENDIO;CRIMINAL\nQ01;INCENDIO: EM RESIDENCIA;CRIMINAL\n`;
    const items = parseIncidentesBaonCsv(csv);
    expect(items.length).toBe(2);
  });

  it('descarta linhas sem código ou descrição', () => {
    const csv = `CODIGO;DESCRICAO;CLASSIFICACAO\nQ01;INCENDIO;CRIMINAL\n;DESCRICAO_SEM_CODIGO;X\nQ02;;X\n`;
    const items = parseIncidentesBaonCsv(csv);
    expect(items.length).toBe(1);
    expect(items[0]?.codigo).toBe('Q01');
  });

  it('classificacao opcional', () => {
    const csv = `CODIGO;DESCRICAO\nQ;INCENDIO\n`;
    const items = parseIncidentesBaonCsv(csv);
    expect(items[0]?.classificacao).toBeUndefined();
  });
});

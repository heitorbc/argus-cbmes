import { describe, it, expect } from 'vitest';
import { parseIseoHospitaisCsv } from './iseo-hospitais-csv-parser';

const HEADER =
  'POSTO/GRAD,NOME DO MILITAR,NF,DATA DA ESCALA,TURNO,FUNÇÃO,CONTATO,CARGA HORÁRIA,OBM,LOTAÇÃO';

describe('parseIseoHospitaisCsv', () => {
  it('parseia 3 linhas HPM com header completo', () => {
    const csv =
      HEADER +
      '\n' +
      'CB,NUBIA FERNANDA GARCIA RODRIGUES,4151194,01/01/2026,Diurno,Operador,28999783149,12h,1ºBBM,1ª Cia\n' +
      '3ºSGT,LIONEL BRAGA NETO,3033201,01/01/2026,Diurno,Operador,27999568701,12h,1ºBBM,1ª Cia\n' +
      'CB,RODRIGO NORONHA SCALZER LOPES,3699374,02/01/2026,Noturno,Operador,27996393762,12h,1ºBBM,1ª Cia\n';
    const items = parseIseoHospitaisCsv(csv, { unidade: 'HPM' });
    expect(items.length).toBe(3);
    expect(items[0]).toMatchObject({
      unidade: 'HPM',
      posto: 'CB',
      nome: 'NUBIA FERNANDA GARCIA RODRIGUES',
      nf: '4151194',
      dataIso: '2026-01-01',
      turno: 'Diurno',
      funcao: 'Operador',
      contato: '28999783149',
    });
    expect(items[2]?.turno).toBe('Noturno');
    expect(items[2]?.dataIso).toBe('2026-01-02');
  });

  it('aceita BOM no início + injeta unidade HIMABA', () => {
    const BOM = '﻿';
    const csv = BOM + HEADER + '\n3ºSGT,RAFAELA ENRIQUE,2511894,15/03/2026,Diurno,Condutor,,,,\n';
    const items = parseIseoHospitaisCsv(csv, { unidade: 'HIMABA' });
    expect(items.length).toBe(1);
    expect(items[0]?.unidade).toBe('HIMABA');
    expect(items[0]?.dataIso).toBe('2026-03-15');
  });

  it('descarta linhas com NF inválida ou data inválida', () => {
    const csv =
      HEADER +
      '\n' +
      'CB,NOME OK,4151194,01/01/2026,Diurno,,,,,\n' +
      ',NOME SEM NF,,01/01/2026,Diurno,,,,,\n' +
      'CB,DATA INVALIDA,4151195,2026/01/01,Diurno,,,,,\n' +
      'CB,NF NAO NUMERICA,ABC,01/01/2026,Diurno,,,,,\n' +
      'CB,TURNO INVALIDO,4151196,01/01/2026,Madrugada,,,,,\n';
    const items = parseIseoHospitaisCsv(csv, { unidade: 'HPM' });
    expect(items.length).toBe(1);
    expect(items[0]?.nome).toBe('NOME OK');
  });

  it('aceita datas no formato DD-MM-YYYY e YYYY-MM-DD', () => {
    const csv =
      HEADER +
      '\n' +
      'CB,X,1,01-02-2026,Diurno,,,,,\n' +
      'CB,Y,2,2026-03-04,Noturno,,,,,\n';
    const items = parseIseoHospitaisCsv(csv, { unidade: 'HPM' });
    expect(items.length).toBe(2);
    expect(items[0]?.dataIso).toBe('2026-02-01');
    expect(items[1]?.dataIso).toBe('2026-03-04');
  });

  it('lança erro se cabeçalho ausente', () => {
    const csv = 'foo,bar,baz\n1,2,3\n';
    expect(() => parseIseoHospitaisCsv(csv, { unidade: 'HPM' })).toThrow(/Cabeçalho/);
  });
});

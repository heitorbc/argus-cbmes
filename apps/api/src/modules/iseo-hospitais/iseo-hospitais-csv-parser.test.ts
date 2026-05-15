import { describe, it, expect } from 'vitest';
import {
  parseIseoHospitaisCsv,
  parseUnidadeFromSheetName,
} from './iseo-hospitais-csv-parser';

const HEADER =
  'POSTO/GRAD,NOME DO MILITAR,NF,DATA DA ESCALA,TURNO,FUNÇÃO,CONTATO,CARGA HORÁRIA,OBM,LOTAÇÃO';

describe('parseIseoHospitaisCsv', () => {
  it('parseia 3 linhas com unidade vinda do nome da aba (HPM)', () => {
    const csv =
      HEADER +
      '\n' +
      'CB,NUBIA FERNANDA GARCIA RODRIGUES,4151194,01/01/2026,Diurno,Operador,28999783149,12h,1ºBBM,1ª Cia\n' +
      '3ºSGT,LIONEL BRAGA NETO,3033201,01/01/2026,Diurno,Operador,27999568701,12h,1ºBBM,1ª Cia\n' +
      'CB,RODRIGO NORONHA SCALZER LOPES,3699374,02/01/2026,Noturno,Operador,27996393762,12h,1ºBBM,1ª Cia\n';
    const items = parseIseoHospitaisCsv(csv, { unidadeFromSheet: 'HPM' });
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
  });

  it('aceita BOM no início + unidade HIMABA via nome da aba', () => {
    const BOM = '﻿';
    const csv = BOM + HEADER + '\n3ºSGT,RAFAELA ENRIQUE,2511894,15/03/2026,Diurno,Condutor,,,,\n';
    const items = parseIseoHospitaisCsv(csv, { unidadeFromSheet: 'HIMABA' });
    expect(items.length).toBe(1);
    expect(items[0]?.unidade).toBe('HIMABA');
  });

  it('aba unificada (sem unidadeFromSheet): infere unidade da coluna OBM', () => {
    const csv =
      HEADER +
      '\n' +
      'CB,A,1111,01/04/2026,Diurno,Operador,,,HPM,ADM\n' +
      'CB,B,2222,01/04/2026,Noturno,Operador,,,HIMABA,DOP\n' +
      'CB,SEM_OBM,3333,01/04/2026,Diurno,Operador,,,,\n';
    const items = parseIseoHospitaisCsv(csv);
    expect(items.length).toBe(2); // SEM_OBM descartado (sem OBM e sem default)
    expect(items.find((i) => i.nf === '1111')?.unidade).toBe('HPM');
    expect(items.find((i) => i.nf === '2222')?.unidade).toBe('HIMABA');
  });

  it('aba unificada com unidadeDefault: usa quando OBM ausente', () => {
    const csv =
      HEADER +
      '\n' +
      'CB,SEM_OBM,3333,01/04/2026,Diurno,Operador,,,,\n';
    const items = parseIseoHospitaisCsv(csv, { unidadeDefault: 'HPM' });
    expect(items.length).toBe(1);
    expect(items[0]?.unidade).toBe('HPM');
  });

  it('aceita header alternativo "MATRÍCULA" no lugar de "NF"', () => {
    // Estrutura das abas ABRIL/MAIO 2026 (cabeçalho institucional na linha 1).
    const csv =
      'ESCALA DE INDENIZAÇÃO SUPLEMENTAR DE ESCALA OPERACIONAL - HOSPITAIS\n' +
      'POSTO/GRAD,DATA,TURNO,FUNÇÃO,CH,MATRÍCULA,NOME DO MILITAR,CONTATO\n' +
      '2ºSGT,29/05/2026,Diurno,Condutor,12H,3037509,2ºSGT BARCELLOS,(27) 99918-6697\n';
    const items = parseIseoHospitaisCsv(csv, { unidadeDefault: 'HPM' });
    expect(items.length).toBe(1);
    expect(items[0]).toMatchObject({
      unidade: 'HPM',
      nf: '3037509',
      nome: 'BARCELLOS',
      posto: '2ºSGT',
      dataIso: '2026-05-29',
      turno: 'Diurno',
    });
  });

  it('layout pareado (2 militares por linha): extrai ambos', () => {
    // ABRIL 2026: 11 colunas com 2 pares (matrícula, nome, contato) lado a lado.
    const csv =
      'ESCALA DE INDENIZAÇÃO SUPLEMENTAR DE ESCALA OPERACIONAL - HOSPITAIS\n' +
      'POSTO/GRAD,DATA,TURNO,FUNÇÃO,CH,MATRÍCULA,NOME DO MILITAR,CONTATO,MATRÍCULA,NOME DO MILITAR,CONTATO\n' +
      'CB,17/04/2026,Diurno,Condutor,12H,4190726,CB IERACITANO,(27) 99772-4174,3037509,2ºSGT BARCELLOS,(27) 99918-6697\n';
    const items = parseIseoHospitaisCsv(csv, { unidadeDefault: 'HPM' });
    expect(items.length).toBe(2);
    expect(items[0]).toMatchObject({ nf: '4190726', nome: 'IERACITANO', posto: 'CB' });
    expect(items[1]).toMatchObject({ nf: '3037509', nome: 'BARCELLOS', posto: '2ºSGT' });
  });

  it('descarta linhas com NF/data/turno inválidos', () => {
    const csv =
      HEADER +
      '\n' +
      'CB,NOME OK,4151194,01/01/2026,Diurno,,,,,\n' +
      ',NOME SEM NF,,01/01/2026,Diurno,,,,,\n' +
      'CB,DATA INVALIDA,4151195,2026/01/01,Diurno,,,,,\n' +
      'CB,TURNO INVALIDO,4151196,01/01/2026,Madrugada,,,,,\n';
    const items = parseIseoHospitaisCsv(csv, { unidadeFromSheet: 'HPM' });
    expect(items.length).toBe(1);
    expect(items[0]?.nome).toBe('NOME OK');
  });

  it('aceita datas DD-MM-YYYY e YYYY-MM-DD', () => {
    const csv =
      HEADER +
      '\n' +
      'CB,X,1,01-02-2026,Diurno,,,,,\n' +
      'CB,Y,2,2026-03-04,Noturno,,,,,\n';
    const items = parseIseoHospitaisCsv(csv, { unidadeFromSheet: 'HPM' });
    expect(items.length).toBe(2);
    expect(items[0]?.dataIso).toBe('2026-02-01');
    expect(items[1]?.dataIso).toBe('2026-03-04');
  });

  it('lança erro se cabeçalho ausente', () => {
    const csv = 'foo,bar,baz\n1,2,3\n';
    expect(() => parseIseoHospitaisCsv(csv, { unidadeFromSheet: 'HPM' })).toThrow(/Cabeçalho/);
  });
});

describe('parseUnidadeFromSheetName', () => {
  it('reconhece prefixos HPM e HIMABA', () => {
    expect(parseUnidadeFromSheetName('HPM JANEIRO 2026')).toBe('HPM');
    expect(parseUnidadeFromSheetName('HIMABA DEZEMBRO 2025')).toBe('HIMABA');
    expect(parseUnidadeFromSheetName('hpm fevereiro 2026')).toBe('HPM');
  });

  it('retorna undefined para abas unificadas', () => {
    expect(parseUnidadeFromSheetName('ABRIL 2026')).toBeUndefined();
    expect(parseUnidadeFromSheetName('MAIO 2026')).toBeUndefined();
    expect(parseUnidadeFromSheetName('Modelo')).toBeUndefined();
  });
});

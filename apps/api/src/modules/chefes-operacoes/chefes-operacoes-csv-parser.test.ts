import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  chefesDoDia,
  parseAnoMesFromSheetName,
  parseChefesOperacoesCsv,
} from './chefes-operacoes-csv-parser';

const FIXTURE_PATH = join(__dirname, '__fixtures__', 'chop-2026-05.csv');

describe('parseChefesOperacoesCsv (fixture maio/2026)', () => {
  const csv = readFileSync(FIXTURE_PATH, 'utf8');

  it('extrai linhas de militares com NF/posto/nome/telefone', () => {
    const parsed = parseChefesOperacoesCsv(csv, { defaultAno: 2026, defaultMes: 5 });
    expect(parsed.militares.length).toBeGreaterThan(20);
    const caliman = parsed.militares.find((c) => c.nomeGuerra === 'CALIMAN');
    expect(caliman).toBeDefined();
    expect(caliman?.nf).toBe('2981157');
    expect(caliman?.posto).toBe('CAP QOC');
    expect(caliman?.telefone).toBe('27996002598');
  });

  it('captura marcadores por dia (X/Y/S/*)', () => {
    const parsed = parseChefesOperacoesCsv(csv, { defaultAno: 2026, defaultMes: 5 });
    const pecanha = parsed.militares.find((c) => c.nomeGuerra === 'PECANHA');
    expect(pecanha?.porDia.get(5)).toBe('X');
  });

  it('chefesDoDia retorna apenas militares escalados (marcador X/Y/S/*)', () => {
    const parsed = parseChefesOperacoesCsv(csv, { defaultAno: 2026, defaultMes: 5 });
    const dia5 = chefesDoDia(parsed.militares, 5);
    const pecanha = dia5.find((c) => c.nomeGuerra === 'PECANHA');
    expect(pecanha).toBeDefined();
    expect(pecanha?.marcador).toBe('X');
  });

  it('chefesDoDia ignora valores não-marcadores (ex.: "CURSO", "FÉRIAS")', () => {
    const parsed = parseChefesOperacoesCsv(csv, { defaultAno: 2026, defaultMes: 5 });
    const dia1 = chefesDoDia(parsed.militares, 1);
    expect(dia1.find((c) => c.nomeGuerra === 'ALINE')).toBeUndefined();
  });

  it('ignora linhas separadoras (Nº vazio ou não numérico)', () => {
    const parsed = parseChefesOperacoesCsv(csv, { defaultAno: 2026, defaultMes: 5 });
    expect(parsed.militares.every((c) => c.nf.length > 0)).toBe(true);
  });

  it('rejeita CSV sem header esperado', () => {
    expect(() =>
      parseChefesOperacoesCsv('a,b,c\n1,2,3', { defaultAno: 2026, defaultMes: 5 }),
    ).toThrow(/Cabe.*alho/);
  });

  it('S2.10.11b: extrai mês do header (fixture tem "MAIO" mas sem ano) → usa defaultAno', () => {
    const parsed = parseChefesOperacoesCsv(csv, { defaultAno: 2026, defaultMes: 99 });
    // Parser pega "MAIO" do header (linha 3) → mes=5
    // Ano não consta no header da fixture → usa defaultAno=2026
    expect(parsed.mes).toBe(5);
    expect(parsed.ano).toBe(2026);
  });

  it('S2.10.11b: extrai ano E mês quando ambos estão no header', () => {
    const csvHeaderCompleto = `MÊS DE ABRIL DE 2026,,,,,,
,,,,,,
,,,,,,
,,,,,,
,,,,,,
,Nº,ANT,POSTO,NOME DE GUERRA,TELEFONE,NF,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31
1,1,100,CAP,SILVA,,3037509,X,,,,,,,,,,,,,,,,,,,,,,,,,,
`;
    const parsed = parseChefesOperacoesCsv(csvHeaderCompleto);
    expect(parsed.ano).toBe(2026);
    expect(parsed.mes).toBe(4);
  });

  it('S2.10.11b: lança erro quando não há header reconhecível nem defaults', () => {
    const csvSemHeader = `,,,,,,
,,,,,,
1,1,100,CAP,X,,1234,X,,,,,,,,,,,,,,,,,,,,,,,,,,,,
,Nº,ANT,POSTO,NOME DE GUERRA,TELEFONE,NF,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31
1,1,100,CAP,SILVA,,3037509,,,,,,,,,,,,,,,,,,,,,,,,,,,,
`;
    expect(() => parseChefesOperacoesCsv(csvSemHeader)).toThrow(/ano\/mes/i);
  });
});

describe('parseAnoMesFromSheetName (S2.10.11b)', () => {
  it('extrai de "ABRIL 2026"', () => {
    expect(parseAnoMesFromSheetName('ABRIL 2026')).toEqual({ ano: 2026, mes: 4 });
  });
  it('extrai de "JAN/2026"', () => {
    expect(parseAnoMesFromSheetName('JAN/2026')).toEqual({ ano: 2026, mes: 1 });
  });
  it('extrai de "DEZEMBRO DE 2025"', () => {
    expect(parseAnoMesFromSheetName('DEZEMBRO DE 2025')).toEqual({ ano: 2025, mes: 12 });
  });
  it('extrai de "MARÇO 2026" (com acento)', () => {
    expect(parseAnoMesFromSheetName('MARÇO 2026')).toEqual({ ano: 2026, mes: 3 });
  });
  it('retorna null quando não há mês reconhecível', () => {
    expect(parseAnoMesFromSheetName('PLANILHA 2026')).toBeNull();
  });
  it('retorna null quando não há ano', () => {
    expect(parseAnoMesFromSheetName('ABRIL')).toBeNull();
  });
});

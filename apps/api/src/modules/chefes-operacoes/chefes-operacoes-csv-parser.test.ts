import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chefesDoDia, parseChefesOperacoesCsv } from './chefes-operacoes-csv-parser';

const FIXTURE_PATH = join(__dirname, '__fixtures__', 'chop-2026-05.csv');

describe('parseChefesOperacoesCsv (fixture maio/2026)', () => {
  const csv = readFileSync(FIXTURE_PATH, 'utf8');

  it('extrai linhas de militares com NF/posto/nome/telefone', () => {
    const parsed = parseChefesOperacoesCsv(csv);
    expect(parsed.length).toBeGreaterThan(20);
    const caliman = parsed.find((c) => c.nomeGuerra === 'CALIMAN');
    expect(caliman).toBeDefined();
    expect(caliman?.nf).toBe('2981157');
    expect(caliman?.posto).toBe('CAP QOC');
    expect(caliman?.telefone).toBe('27996002598');
  });

  it('captura marcadores por dia (X/Y/S/*)', () => {
    const parsed = parseChefesOperacoesCsv(csv);
    const pecanha = parsed.find((c) => c.nomeGuerra === 'PECANHA');
    expect(pecanha?.porDia.get(5)).toBe('X');
  });

  it('chefesDoDia retorna apenas militares escalados (marcador X/Y/S/*)', () => {
    const parsed = parseChefesOperacoesCsv(csv);
    const dia5 = chefesDoDia(parsed, 5);
    const pecanha = dia5.find((c) => c.nomeGuerra === 'PECANHA');
    expect(pecanha).toBeDefined();
    expect(pecanha?.marcador).toBe('X');
  });

  it('chefesDoDia ignora valores não-marcadores (ex.: "CURSO", "FÉRIAS")', () => {
    const parsed = parseChefesOperacoesCsv(csv);
    // ALINE tem "CURSO" no dia 1 — não deve aparecer
    const dia1 = chefesDoDia(parsed, 1);
    expect(dia1.find((c) => c.nomeGuerra === 'ALINE')).toBeUndefined();
  });

  it('ignora linhas separadoras (Nº vazio ou não numérico)', () => {
    const parsed = parseChefesOperacoesCsv(csv);
    // Linhas com NF vazio devem ter sido descartadas
    expect(parsed.every((c) => c.nf.length > 0)).toBe(true);
  });

  it('rejeita CSV sem header esperado', () => {
    expect(() => parseChefesOperacoesCsv('a,b,c\n1,2,3')).toThrow(/Cabe.*alho/);
  });
});

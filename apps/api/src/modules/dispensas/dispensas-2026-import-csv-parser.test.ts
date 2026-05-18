import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseDispensas2026Csv } from './dispensas-2026-import-csv-parser';

const FIXTURE = readFileSync(join(__dirname, '__fixtures__', 'dispensas-2026-sample.csv'), 'utf-8');

describe('parseDispensas2026Csv (S2.10.7d)', () => {
  it('extrai linha com 1 tipo simples (LOUZADA — IX_OUTRAS 1 dia)', () => {
    const linhas = parseDispensas2026Csv(FIXTURE, 2026);
    const louzada = linhas.filter((l) => l.militarRaw === '3ºSGT LOUZADA');
    expect(louzada).toHaveLength(1);
    expect(louzada[0]).toMatchObject({
      nfRaw: '3037703',
      data: '2026-01-03',
      edocs: 'S/ EDOCS',
      equipe: 'A',
      tipo: 'IX_OUTRAS',
      dias: 1,
    });
  });

  it('linha com 2 tipos preenchidos gera 2 entries (JARDEL: VI=6, VII=2)', () => {
    const linhas = parseDispensas2026Csv(FIXTURE, 2026);
    const jardel = linhas.filter((l) => l.militarRaw === '2ºSGT JARDEL');
    expect(jardel).toHaveLength(2);
    const tipos = jardel.map((l) => l.tipo).sort();
    expect(tipos).toEqual(['VII_MERITO', 'VI_ASSIDUIDADE']);
    expect(jardel.find((l) => l.tipo === 'VI_ASSIDUIDADE')?.dias).toBe(6);
    expect(jardel.find((l) => l.tipo === 'VII_MERITO')?.dias).toBe(2);
    expect(jardel[0]?.data).toBe('2026-01-04');
    expect(jardel[0]?.minuta).toBe('150829');
  });

  it('linha com 2 tipos não-adjacentes (ESMAEL: I_TAF=4, V_ANIVERSARIO=1)', () => {
    const linhas = parseDispensas2026Csv(FIXTURE, 2026);
    const esmael = linhas.filter((l) => l.militarRaw === 'CB ESMAEL');
    expect(esmael).toHaveLength(2);
    const tipos = esmael.map((l) => l.tipo).sort();
    expect(tipos).toEqual(['I_TAF', 'V_ANIVERSARIO']);
    expect(esmael.find((l) => l.tipo === 'I_TAF')?.dias).toBe(4);
    expect(esmael.find((l) => l.tipo === 'V_ANIVERSARIO')?.dias).toBe(1);
    expect(esmael[0]?.minuta).toBe('151012');
  });

  it('linha sem NF (SCARAMUSSA) cai com nfRaw=undefined — caller resolve via NomeMatcher', () => {
    const linhas = parseDispensas2026Csv(FIXTURE, 2026);
    const scaramussa = linhas.filter((l) => l.militarRaw === 'SD SCARAMUSSA');
    expect(scaramussa.length).toBeGreaterThan(0);
    expect(scaramussa[0]?.nfRaw).toBeUndefined();
  });

  it('ignora header de mês e header de tabela', () => {
    const linhas = parseDispensas2026Csv(FIXTURE, 2026);
    expect(linhas.find((l) => l.militarRaw === 'JANEIRO')).toBeUndefined();
    expect(linhas.find((l) => l.militarRaw === 'FEVEREIRO')).toBeUndefined();
    expect(linhas.find((l) => l.militarRaw === 'NOME')).toBeUndefined();
  });

  it('cobre múltiplos meses (janeiro + fevereiro)', () => {
    const linhas = parseDispensas2026Csv(FIXTURE, 2026);
    const jan = linhas.filter((l) => l.data.startsWith('2026-01'));
    const fev = linhas.filter((l) => l.data.startsWith('2026-02'));
    expect(jan.length).toBeGreaterThan(0);
    expect(fev.length).toBeGreaterThan(0);
  });

  it('preserva OBS na coluna O (BORBA: 12H em col O, tipo IX_OUTRAS)', () => {
    const linhas = parseDispensas2026Csv(FIXTURE, 2026);
    const borba = linhas.find((l) => l.militarRaw === 'SD BORBA');
    expect(borba).toBeDefined();
    expect(borba?.observacoes).toBe('12H');
    expect(borba?.tipo).toBe('IX_OUTRAS');
    expect(borba?.dias).toBe(1);
  });

  it('captura equipe livre (BORBA: equipe=MERGULHO)', () => {
    const linhas = parseDispensas2026Csv(FIXTURE, 2026);
    const borba = linhas.find((l) => l.militarRaw === 'SD BORBA');
    expect(borba?.equipe).toBe('MERGULHO');
  });

  it('descarta entries com dias=0 ou não-numéricos', () => {
    const csv = `"","NOME","","EDOCS","EQUIPE","I","II","III","IV","","","VII","VIII","O","OBS","","","",""
"123","SD TESTE","01/01/2026","","A","0","abc","","","","","","","","","","","",""`;
    const linhas = parseDispensas2026Csv(csv, 2026);
    expect(linhas).toHaveLength(0);
  });

  it('aceita data curta DD/MM com anoDefault aplicado', () => {
    const csv = `"","NOME","","EDOCS","EQUIPE","I","II","III","IV","","","VII","VIII","O","OBS","","","",""
"123","SD CURTA","05/04","","A","2","","","","","","","","","","","","",""`;
    const linhas = parseDispensas2026Csv(csv, 2026);
    expect(linhas[0]?.data).toBe('2026-04-05');
  });

  it('descarta data inválida (skip silencioso)', () => {
    const csv = `"","NOME","","EDOCS","EQUIPE","I","II","III","IV","","","VII","VIII","O","OBS","","","",""
"123","SD INVALIDA","not-a-date","","A","2","","","","","","","","","","","","",""`;
    const linhas = parseDispensas2026Csv(csv, 2026);
    expect(linhas).toHaveLength(0);
  });
});

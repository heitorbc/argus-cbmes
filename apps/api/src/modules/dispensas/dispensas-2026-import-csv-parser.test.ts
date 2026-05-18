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

  it('S2.10.7e — sequencia dispensas: JARDEL VI(04/01 +6d) → VII(10/01 +2d)', () => {
    const linhas = parseDispensas2026Csv(FIXTURE, 2026);
    const jardel = linhas.filter((l) => l.militarRaw === '2ºSGT JARDEL');
    expect(jardel).toHaveLength(2);

    const vi = jardel.find((l) => l.tipo === 'VI_ASSIDUIDADE')!;
    const vii = jardel.find((l) => l.tipo === 'VII_MERITO')!;
    expect(vi.dias).toBe(6);
    expect(vii.dias).toBe(2);
    // S2.10.7e — sequenciamento: VI cobre 04-09/01, VII inicia 10/01
    expect(vi.data).toBe('2026-01-04');
    expect(vii.data).toBe('2026-01-10');
    // Ambas compartilham o mesmo E-Docs e MINUTA (vem da linha única)
    expect(vi.edocs).toBe('2025-VJGXD3');
    expect(vii.edocs).toBe('2025-VJGXD3');
    expect(vi.minuta).toBe('150829');
    expect(vii.minuta).toBe('150829');
  });

  it('S2.10.7e — sequencia tipos NÃO-adjacentes (ESMAEL: I_TAF=4 em 09/01 → V_ANIVERSARIO=1 em 13/01)', () => {
    const linhas = parseDispensas2026Csv(FIXTURE, 2026);
    const esmael = linhas.filter((l) => l.militarRaw === 'CB ESMAEL');
    expect(esmael).toHaveLength(2);
    const taf = esmael.find((l) => l.tipo === 'I_TAF')!;
    const aniv = esmael.find((l) => l.tipo === 'V_ANIVERSARIO')!;
    expect(taf.dias).toBe(4);
    expect(aniv.dias).toBe(1);
    expect(taf.data).toBe('2026-01-09');
    expect(aniv.data).toBe('2026-01-13'); // 09/01 + 4 dias
    expect(taf.minuta).toBe('151012');
  });

  it('S2.10.7e — sequencia 3 tipos: SCARAMUSSA V=1 (01/02) → VI=3 (02/02) → IX=1 (05/02)', () => {
    const linhas = parseDispensas2026Csv(FIXTURE, 2026);
    const scaramussa = linhas.filter((l) => l.militarRaw === 'SD SCARAMUSSA');
    expect(scaramussa).toHaveLength(3);
    const v = scaramussa.find((l) => l.tipo === 'V_ANIVERSARIO')!;
    const vi = scaramussa.find((l) => l.tipo === 'VI_ASSIDUIDADE')!;
    const ix = scaramussa.find((l) => l.tipo === 'IX_OUTRAS')!;
    expect(v.dias).toBe(1);
    expect(vi.dias).toBe(3);
    expect(ix.dias).toBe(1);
    expect(v.data).toBe('2026-02-01'); // dataInicial
    expect(vi.data).toBe('2026-02-02'); // V cobre só 01/02 → VI inicia 02/02
    expect(ix.data).toBe('2026-02-05'); // VI cobre 02-04/02 → IX inicia 05/02
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

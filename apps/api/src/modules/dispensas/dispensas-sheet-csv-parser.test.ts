import { describe, it, expect } from 'vitest';
import { parseDispensasSheetCsv } from './dispensas-sheet-csv-parser';

const CSV_FIXTURE = `"DISPENSAS CONCEDIDAS EM 2026 JANEIRO NOME","DATA","EDOCS","EQUIPE","MINUTA","","MARÇO NOME","DATA","EDOCS","EQUIPE","MINUTA","","MAIO NOME","DATA","EDOCS","EQUIPE","MINUTA"
"SGT JARDEL","04/01/2026","2025-VJGXD3","B","150829","","SD BEN HUR","04/03","","A","153136","","SGT HOFFMAM","01/05","2026-3KRT69","C","FEITO"
"SGT LOUZADA","03/01/2026","S/ EDOCS","A","","","SGT HOMERO","07/03","","D","153138","","CB CUPERTINO","04/05","2026-7PSKJ9","B","FEITO"
"CB ESMAEL","09/01","2026-4N8MJ1","C","151012","","CB SCALZER","11/03","2026-14NCD7","D","143141","","CB ELSON","08/05","DIRETRIZ CHS","B","OK"
"","","","","","","","","","","","","","","","",""
"FEVEREIRO","","","","","","ABRIL","","","","","","JUNHO","","","",""
"NOME","","EDOCS","EQUIPE","","","NOME","","EDOCS","EQUIPE","","BCG","NOME","","EDOCS","EQUIPE","MINUTA"
"CB BERGI","08/02","2026-GT78WP","A","151524","","CB IZACK","04/04","2026-WD2JPK","D","154397","","CB LUCIANO","12/06","2026-GGGCBH","",""
`;

describe('parseDispensasSheetCsv (item 2)', () => {
  it('parseia 3 blocos do bloco 1 (jan/mar/mai)', () => {
    const r = parseDispensasSheetCsv(CSV_FIXTURE);
    const jan = r.filter((d) => d.data.startsWith('2026-01'));
    const mar = r.filter((d) => d.data.startsWith('2026-03'));
    const mai = r.filter((d) => d.data.startsWith('2026-05'));
    expect(jan).toHaveLength(3);
    expect(mar).toHaveLength(3);
    expect(mai).toHaveLength(3);
  });

  it('parseia bloco 2 (fev/abr/jun)', () => {
    const r = parseDispensasSheetCsv(CSV_FIXTURE);
    expect(r.find((d) => d.militarRaw === 'CB BERGI')?.data).toBe('2026-02-08');
    expect(r.find((d) => d.militarRaw === 'CB IZACK')?.data).toBe('2026-04-04');
    expect(r.find((d) => d.militarRaw === 'CB LUCIANO')?.data).toBe('2026-06-12');
  });

  it('mapeia equipe + edocs + minuta corretamente', () => {
    const r = parseDispensasSheetCsv(CSV_FIXTURE);
    const jardel = r.find((d) => d.militarRaw === 'SGT JARDEL')!;
    expect(jardel.equipe).toBe('B');
    expect(jardel.edocs).toBe('2025-VJGXD3');
    expect(jardel.minuta).toBe('150829');
  });

  it('aceita data DD/MM (ano herdado do header) E DD/MM/AAAA', () => {
    const r = parseDispensasSheetCsv(CSV_FIXTURE);
    expect(r.find((d) => d.militarRaw === 'SGT JARDEL')?.data).toBe('2026-01-04');
    expect(r.find((d) => d.militarRaw === 'CB ESMAEL')?.data).toBe('2026-01-09');
  });

  it('preserva edocs alternativos não-padrão (S/ EDOCS, DIRETRIZ CHS, OK)', () => {
    const r = parseDispensasSheetCsv(CSV_FIXTURE);
    expect(r.find((d) => d.militarRaw === 'SGT LOUZADA')?.edocs).toBe('S/ EDOCS');
    expect(r.find((d) => d.militarRaw === 'CB ELSON')?.edocs).toBe('DIRETRIZ CHS');
  });
});

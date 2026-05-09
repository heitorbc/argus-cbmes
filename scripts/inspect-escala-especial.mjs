import { createRequire } from 'node:module';
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const ExcelJS = require('exceljs');

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile('apps/api/src/modules/escalas-especiais/__fixtures__/05 - ESCALA ESPECIAL 1ª CIA - MAIO.xlsm');

const ws = wb.getWorksheet('Modelo Aviso - Especial');
console.log('cols:', ws.actualColumnCount, 'rows:', ws.actualRowCount);

// Lê colunas 14-30 das linhas 3-15
for (let r = 1; r <= 12; r++) {
  const row = ws.getRow(r);
  const cells = [];
  for (let c = 14; c <= Math.min(30, ws.actualColumnCount); c++) {
    const v = row.getCell(c).value;
    let s = '';
    if (v == null) s = '';
    else if (v instanceof Date) s = v.toISOString().slice(0,10);
    else if (typeof v === 'object' && 'text' in v) s = String(v.text).slice(0,18);
    else if (typeof v === 'object' && 'result' in v) s = String(v.result ?? '').slice(0,18);
    else s = String(v).slice(0,18);
    cells.push(`c${c}:${s.padEnd(16)}`);
  }
  console.log(`R${String(r).padStart(2,'0')}|${cells.join('|')}`);
}

// Inspeção detalhada de 05 MAIO 2026 — referência canônica do parser S3b.
import { createRequire } from 'node:module';
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const ExcelJS = require('exceljs');

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile('data/Escala de Serviço/05 MAIO DE 2026.xlsx');

console.log('Abas disponíveis:');
for (const w of wb.worksheets) console.log(`  "${w.name}"`);

for (const ws of wb.worksheets) {
  const nm = ws.name.toUpperCase();
  if (!/(\b0?1\s*A\s*1?[34]\b|\b1?[45]\s*A\s*(?:29|30|31)\b)/.test(nm)) continue;
  const tabName = ws.name;
  console.log('\n=========================================');
  console.log('📋', tabName, `(${ws.actualRowCount} × ${ws.actualColumnCount})`);
  console.log('=========================================');

  for (let r = 1; r <= Math.min(40, ws.actualRowCount); r++) {
    const row = ws.getRow(r);
    const cells = [];
    for (let c = 1; c <= Math.min(20, ws.actualColumnCount); c++) {
      const v = row.getCell(c).value;
      let s = '';
      if (v == null) s = '';
      else if (typeof v === 'object' && 'text' in v) s = v.text;
      else if (v instanceof Date) s = v.toISOString().slice(0, 10);
      else s = String(v);
      cells.push(s.slice(0, 14));
    }
    console.log(`R${String(r).padStart(2, '0')}|${cells.map((s, i) => `c${String(i + 1).padStart(2, '0')}:${s.padEnd(14)}`).join('|')}`);
  }
}

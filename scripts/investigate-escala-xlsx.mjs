// Script de investigação one-shot dos XLSX de escala (S3 prep).
// Imprime: nome do arquivo, abas, dimensões, primeiras 5 linhas de cada aba.
// Uso: node scripts/investigate-escala-xlsx.mjs

import ExcelJS from 'exceljs';
import { readdirSync } from 'node:fs';
import { join, basename } from 'node:path';

const DIR = 'data/Escala de Serviço';

const files = readdirSync(DIR).filter((f) => f.endsWith('.xlsx'));

for (const f of files) {
  const path = join(DIR, f);
  console.log('\n=========================================');
  console.log('📄', f);
  console.log('=========================================');

  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.readFile(path);
  } catch (err) {
    console.log(`  ❌ Erro lendo: ${err.message}`);
    continue;
  }

  console.log(`  Abas (${wb.worksheets.length}):`);
  for (const ws of wb.worksheets) {
    console.log(`    - "${ws.name}" (${ws.actualRowCount} linhas, ${ws.actualColumnCount} colunas)`);
  }

  // Imprime primeiras 8 linhas das primeiras 2 abas
  for (const ws of wb.worksheets.slice(0, 2)) {
    console.log(`\n  --- Aba "${ws.name}" — primeiras 8 linhas ---`);
    for (let r = 1; r <= Math.min(8, ws.actualRowCount); r++) {
      const row = ws.getRow(r);
      const cells = [];
      for (let c = 1; c <= Math.min(35, ws.actualColumnCount); c++) {
        const v = row.getCell(c).value;
        const s = v == null ? '' : typeof v === 'object' && 'text' in v ? v.text : String(v);
        cells.push(s.slice(0, 12));
      }
      console.log(`    R${r}: ${cells.map((s) => s.padEnd(12)).join('|')}`);
    }
  }
}

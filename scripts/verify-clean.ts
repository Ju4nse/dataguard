/**
 * Verifica que un archivo depurado no contenga ningún valor sensible del original.
 * Uso: npm run verify-clean -- <original.xlsx|csv> <depurado.xlsx|csv>
 */
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { analyzeTable, cellToString, scanText, type CellValue, type Table } from '../packages/detector/src';

function readTable(path: string): Table {
  const wb = XLSX.read(readFileSync(path), { cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]!]!;
  const [headers = [], ...rows] = XLSX.utils.sheet_to_json<CellValue[]>(ws, { header: 1, raw: true, defval: null });
  return { headers: headers.map((h) => String(h ?? '')), rows };
}

const [originalPath, cleanPath] = process.argv.slice(2);
if (!originalPath || !cleanPath) {
  console.error('Uso: npm run verify-clean -- <original> <depurado>');
  process.exit(2);
}

const original = readTable(originalPath);
const clean = readTable(cleanPath);

// Valores sensibles del original: columnas detectadas con confianza alta/media + fragmentos en texto libre.
const secrets = new Set<string>();
for (const f of analyzeTable(original)) {
  if (f.kind === 'ninguno' || f.confidence === 'baja') continue;
  for (const row of original.rows) {
    const s = cellToString(row[f.index]);
    if (!s) continue;
    if (f.kind === 'columna') secrets.add(s);
    else scanText(s).forEach((sp) => secrets.add(sp.value));
  }
}

const haystack = clean.rows.map((r) => r.map(cellToString).join('\u0001')).join('\n');
const leaks = [...secrets].filter((s) => s.length >= 4 && haystack.includes(s));

console.log(`Valores sensibles en el original: ${secrets.size}`);
if (leaks.length === 0) {
  console.log('✅ El archivo depurado no contiene ninguno.');
} else {
  console.log(`❌ Quedaron ${leaks.length} valores sensibles en el depurado (se muestran enmascarados):`);
  for (const l of leaks.slice(0, 20)) console.log(`  - ${l.slice(0, 2)}${'•'.repeat(Math.max(0, l.length - 4))}${l.slice(-2)}`);
  process.exit(1);
}

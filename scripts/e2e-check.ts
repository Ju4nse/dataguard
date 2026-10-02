/**
 * Replica el flujo de la app sobre el fixture con las acciones sugeridas por defecto
 * y escribe salida_e2e.xlsx para chequearlo con verify-clean.
 * Uso: npm run e2e
 */
import { readFileSync, writeFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { analyzeTable, applyDecisions, type CellValue, type ColumnDecision } from '../packages/detector/src';
import { PSEUDONYM_PREFIXES } from '../packages/shared/src';

const wb = XLSX.read(readFileSync('fixtures/clientes_demo.xlsx'), { cellDates: true });
const [headers = [], ...rows] = XLSX.utils.sheet_to_json<CellValue[]>(wb.Sheets[wb.SheetNames[0]!]!, { header: 1, raw: true, defval: null });
const table = { headers: headers.map(String), rows };

const decisions: Record<number, ColumnDecision> = {};
for (const f of analyzeTable(table)) {
  decisions[f.index] =
    f.kind === 'ninguno'
      ? { action: 'mantener', type: null, kind: 'columna' }
      : { action: f.suggestedAction, type: f.type, kind: f.kind, prefix: f.type ? PSEUDONYM_PREFIXES[f.type] : undefined };
}

const res = applyDecisions(table, decisions);
const out = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(out, XLSX.utils.aoa_to_sheet([res.table.headers, ...res.table.rows], { cellDates: true }), 'Datos');
writeFileSync('salida_e2e.xlsx', XLSX.write(out, { type: 'buffer', bookType: 'xlsx' }) as Buffer);

console.log(`Columnas resultantes: ${res.table.headers.join(', ')}`);
console.log(`Seudónimos generados: ${res.equivalences.length} · Transformados por tipo: ${JSON.stringify(res.transformedCounts)}`);

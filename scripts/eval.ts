/**
 * Mide la calidad del detector sobre el corpus etiquetado.
 * Uso: npm run eval               (resumen de los dos sets)
 *      npm run eval -- --errores  (lista cada falso positivo / negativo)
 */
import { evaluate, type EvalReport } from '../packages/detector/eval/evaluate';

const pct = (n: number) => `${(n * 100).toFixed(0).padStart(3)}%`;
const showErrors = process.argv.includes('--errores');

function print(title: string, r: EvalReport) {
  console.log(`\n=== ${title} ===`);
  console.log('Tipo               Acierto  Falsos+  Perdidos  Precisión  Cobertura   F1');
  for (const [type, m] of Object.entries(r.byType).sort()) {
    console.log(`${type.padEnd(18)} ${String(m.tp).padStart(7)} ${String(m.fp).padStart(8)} ${String(m.fn).padStart(9)}  ${pct(m.precision).padStart(9)}  ${pct(m.recall).padStart(9)}  ${pct(m.f1)}`);
  }
  const o = r.overall;
  console.log('─'.repeat(78));
  console.log(`${'TOTAL'.padEnd(18)} ${String(o.tp).padStart(7)} ${String(o.fp).padStart(8)} ${String(o.fn).padStart(9)}  ${pct(o.precision).padStart(9)}  ${pct(o.recall).padStart(9)}  ${pct(o.f1)}`);
  if (showErrors && r.mistakes.length) {
    console.log('\nErrores:');
    for (const m of r.mistakes) console.log(`  ${m.kind}  ${m.type.padEnd(16)} ${m.caseId.padEnd(26)} "${m.value}"`);
  }
}

console.log('Precisión = cuántas detecciones son correctas · Cobertura = cuánto de lo sensible se encuentra');
const dev = evaluate('desarrollo');
print('Texto libre — set de desarrollo (casos usados para ajustar las reglas)', dev);
print('Texto libre — set de validación (casos nuevos, mide cómo generaliza)', evaluate('validacion'));

console.log(`\n=== Columnas de tablas: ${dev.table.correct}/${dev.table.total} clasificadas correctamente ===`);
if (showErrors) for (const m of dev.table.mistakes) console.log(`  ${m.id.padEnd(30)} esperado: ${m.expected ?? '(nada)'}  obtenido: ${m.got ?? '(nada)'}`);

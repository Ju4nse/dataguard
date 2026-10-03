/**
 * Compara el detector solo con reglas contra reglas + IA local (GLiNER) sobre el corpus etiquetado.
 * Necesita el modelo descargado en .cache/modelos/ (ver README).
 * Uso: npm run eval:ia               (resumen)
 *      npm run eval:ia -- --errores  (lista lo que la IA agregó o perdió)
 *      npm run eval:ia -- --umbral 0.4   (mismo umbral para todas las etiquetas, para comparar)
 *      npm run eval:ia -- --ventana 32   (palabras por ventana de análisis)
 *      npm run eval:ia -- --modelo onnx/model.onnx   (otro archivo ONNX dentro de la carpeta del modelo)
 *      npm run eval:ia -- --control      (agrega el set de control: usarlo solo para la medición final)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Tokenizer } from '@huggingface/tokenizers';
import * as ort from 'onnxruntime-web';
import { combineModelSpans, scanText, type Span } from '../packages/detector/src';
import { caseTexts, evaluate, type EvalReport } from '../packages/detector/eval/evaluate';
import { DEFAULT_CONFIG, detectInSegments, glinerTokenizer, LABEL_NAMES, LABEL_THRESHOLDS, MODEL, ortRunner } from '../packages/ml/src';

const dir = join('.cache', 'modelos', MODEL.id.split('/')[1]!);
const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const uniform = arg('--umbral');
const thresholds = uniform ? Object.fromEntries(LABEL_NAMES.map((l) => [l, Number(uniform)])) : LABEL_THRESHOLDS;
const showErrors = process.argv.includes('--errores');
const withControl = process.argv.includes('--control');
const config = { ...DEFAULT_CONFIG, windowWords: Number(arg('--ventana') ?? DEFAULT_CONFIG.windowWords) };

const t0 = performance.now();
const tokenizer = new Tokenizer(
  JSON.parse(readFileSync(join(dir, MODEL.tokenizer), 'utf8')),
  JSON.parse(readFileSync(join(dir, MODEL.tokenizerConfig), 'utf8')),
);
const onnxFile = arg('--modelo') ?? MODEL.onnx;
const session = await ort.InferenceSession.create(readFileSync(join(dir, onnxFile)));
const tok = glinerTokenizer(tokenizer);
const runner = ortRunner(session, ort.Tensor);
console.log(
  `${onnxFile} cargado en ${((performance.now() - t0) / 1000).toFixed(1)} s · ventana ${config.windowWords} palabras · umbrales ${JSON.stringify(thresholds)}`,
);

// Cada caso por separado (como un prompt), para medir también el tiempo por texto.
const model = new Map<string, Span[]>();
const times: number[] = [];
for (const text of [...caseTexts('desarrollo'), ...caseTexts('validacion'), ...caseTexts('dificiles'), ...(withControl ? caseTexts('control') : [])]) {
  const t = performance.now();
  const [spans] = await detectInSegments([text], tok, runner, { thresholds, config });
  times.push(performance.now() - t);
  model.set(text, spans ?? []);
}
times.sort((a, b) => a - b);
console.log(`${times.length} textos · mediana ${times[Math.floor(times.length / 2)]!.toFixed(0)} ms · máximo ${times.at(-1)!.toFixed(0)} ms por texto`);

const withAi = (text: string) => combineModelSpans(scanText(text), model.get(text) ?? [], text);
const onlyAi = (text: string) => model.get(text) ?? [];

const pct = (n: number) => `${(n * 100).toFixed(0)}%`.padStart(5);
function compare(title: string, rules: EvalReport, ai: EvalReport, alone: EvalReport) {
  console.log(`\n=== ${title} ===`);
  console.log('Tipo                    Solo reglas (P / C)   Reglas + IA (P / C)   Solo IA (P / C)');
  const types = new Set([...Object.keys(rules.byType), ...Object.keys(ai.byType)]);
  for (const t of [...types].sort()) {
    const r = rules.byType[t];
    const a = ai.byType[t];
    const o = alone.byType[t];
    const cell = (m?: { precision: number; recall: number }) => (m ? `${pct(m.precision)} / ${pct(m.recall)}` : '      —      ');
    console.log(`${t.padEnd(22)}  ${cell(r).padEnd(20)}  ${cell(a).padEnd(20)}  ${cell(o)}`);
  }
  const line = (name: string, r: EvalReport) => `${name}: precisión ${pct(r.overall.precision)} · cobertura ${pct(r.overall.recall)} · F1 ${pct(r.overall.f1)}`;
  console.log('─'.repeat(86));
  console.log(line('Solo reglas', rules));
  console.log(line('Reglas + IA', ai));
  if (showErrors) {
    const key = (m: EvalReport['mistakes'][number]) => `${m.kind} ${m.type} ${m.caseId} ${m.value}`;
    const before = new Set(rules.mistakes.map(key));
    const after = new Set(ai.mistakes.map(key));
    console.log('\nErrores nuevos con IA:');
    for (const m of ai.mistakes) if (!before.has(key(m))) console.log(`  ${m.kind}  ${m.type.padEnd(16)} ${m.caseId.padEnd(26)} "${m.value}"`);
    console.log('Errores que la IA corrigió:');
    for (const m of rules.mistakes) if (!after.has(key(m))) console.log(`  ${m.kind}  ${m.type.padEnd(16)} ${m.caseId.padEnd(26)} "${m.value}"`);
  }
}

const TITLES = {
  desarrollo: 'Set de desarrollo (casos usados para ajustar las reglas)',
  validacion: 'Set de validación (casos nuevos)',
  dificiles: 'Casos difíciles para las reglas (escritos antes de medir la IA)',
  control: 'Set de control (nunca usado para calibrar)',
} as const;
const sets = ['desarrollo', 'validacion', 'dificiles', ...(withControl ? ['control' as const] : [])] as const;
for (const set of sets) compare(TITLES[set], evaluate(set), evaluate(set, withAi), evaluate(set, onlyAi));

// Documento largo: los casos nuevos y difíciles unidos en un solo texto (como un PDF), analizado de una vez.
// Mide si el modelo pierde datos cuando el contexto es largo.
const texts = [...caseTexts('validacion'), ...caseTexts('dificiles')];
const doc = texts.join('\n');
const t1 = performance.now();
const [docSpans] = await detectInSegments([doc], tok, runner, { thresholds, config });
console.log(`\nDocumento largo: ${doc.split(/\s+/).length} palabras analizadas en ${((performance.now() - t1) / 1000).toFixed(1)} s`);
const inDoc = new Map<string, Span[]>();
let offset = 0;
for (const text of texts) {
  const end = offset + text.length;
  inDoc.set(
    text,
    (docSpans ?? []).filter((x) => x.start >= offset && x.end <= end).map((x) => ({ ...x, start: x.start - offset, end: x.end - offset })),
  );
  offset = end + 1;
}
const docAi = (text: string) => combineModelSpans(scanText(text), inDoc.get(text) ?? [], text);
const docAlone = (text: string) => inDoc.get(text) ?? [];
compare('Casos nuevos como documento largo', evaluate('validacion'), evaluate('validacion', docAi), evaluate('validacion', docAlone));
compare('Casos difíciles como documento largo', evaluate('dificiles'), evaluate('dificiles', docAi), evaluate('dificiles', docAlone));

/**
 * Calibra el umbral de cada etiqueta de la IA local: corre el modelo una vez con umbral bajo y
 * después prueba umbrales por etiqueta, buscando el mejor F1 (reglas + IA) sobre los sets de
 * desarrollo, validación y difíciles. El set de control NO se usa acá (es para medir al final).
 * Uso: npm run calibrar:ia -- --modelo onnx/model_w8.onnx [--ventana 48]
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Tokenizer } from '@huggingface/tokenizers';
import * as ort from 'onnxruntime-web';
import { combineModelSpans, scanText, type Span } from '../packages/detector/src';
import { caseTexts, evaluate, type EvalSet } from '../packages/detector/eval/evaluate';
import { DEFAULT_CONFIG, detectInSegments, glinerTokenizer, LABEL_NAMES, LABELS, MODEL, ortRunner, type ModelSpan } from '../packages/ml/src';

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const dir = join('.cache', 'modelos', MODEL.id.split('/')[1]!);
const onnxFile = arg('--modelo') ?? MODEL.onnx;
const config = { ...DEFAULT_CONFIG, windowWords: Number(arg('--ventana') ?? DEFAULT_CONFIG.windowWords) };
const FLOOR = 0.25;

const tokenizer = new Tokenizer(
  JSON.parse(readFileSync(join(dir, MODEL.tokenizer), 'utf8')),
  JSON.parse(readFileSync(join(dir, MODEL.tokenizerConfig), 'utf8')),
);
const session = await ort.InferenceSession.create(readFileSync(join(dir, onnxFile)));
const tok = glinerTokenizer(tokenizer);
const runner = ortRunner(session, ort.Tensor);

const SETS: EvalSet[] = ['desarrollo', 'validacion', 'dificiles'];
const raw = new Map<string, ModelSpan[]>();
const floor = Object.fromEntries(LABEL_NAMES.map((l) => [l, FLOOR]));
for (const text of SETS.flatMap(caseTexts)) {
  const [spans] = await detectInSegments([text], tok, runner, { thresholds: floor, config });
  raw.set(text, spans ?? []);
}

// Etiqueta del modelo de cada tipo (para filtrar por umbral de etiqueta).
const labelOf = Object.fromEntries(Object.entries(LABELS).map(([l, t]) => [t, l]));
function score(thresholds: Record<string, number>) {
  const detect = (text: string): Span[] =>
    combineModelSpans(
      scanText(text),
      (raw.get(text) ?? []).filter((s) => s.score >= thresholds[labelOf[s.type]!]!),
      text,
    );
  let tp = 0;
  let fp = 0;
  let fn = 0;
  for (const set of SETS) {
    const o = evaluate(set, detect).overall;
    tp += o.tp;
    fp += o.fp;
    fn += o.fn;
  }
  const p = tp / (tp + fp || 1);
  const r = tp / (tp + fn || 1);
  return { p, r, f1: (2 * p * r) / (p + r || 1) };
}

const CANDIDATES = [0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9];
const best: Record<string, number> = Object.fromEntries(LABEL_NAMES.map((l) => [l, 0.5]));
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
// Ascenso por coordenadas: dos pasadas, una etiqueta a la vez.
for (let pass = 0; pass < 2; pass++) {
  for (const label of LABEL_NAMES) {
    console.log(`\n${label} (pasada ${pass + 1})`);
    let top = { t: best[label]!, f1: -1 };
    for (const t of CANDIDATES) {
      const m = score({ ...best, [label]: t });
      console.log(`  ${t.toFixed(2)}  precisión ${pct(m.p)}  cobertura ${pct(m.r)}  F1 ${pct(m.f1)}`);
      // A igual F1 se prefiere el umbral más alto (menos falsos positivos fuera del corpus).
      if (m.f1 >= top.f1) top = { t, f1: m.f1 };
    }
    best[label] = top.t;
  }
}
const m = score(best);
console.log(`\nUmbrales: ${JSON.stringify(best)}\nprecisión ${pct(m.p)} · cobertura ${pct(m.r)} · F1 ${pct(m.f1)}`);

/**
 * Inferencia de GLiNER (arquitectura "span", ej. gliner_multi_pii-v1) independiente del runtime:
 * acá está el pre y post-procesamiento; el modelo ONNX lo corre un `GlinerRunner` (onnxruntime-web
 * en el navegador o en Node). Sigue la implementación de referencia en Python (urchade/GLiNER).
 */

export interface GlinerConfig {
  /** Ancho máximo de una entidad, en palabras. */
  maxWidth: number;
  /** Máximo de tokens del encoder (mDeBERTa: 512). */
  maxTokens: number;
  /** Máximo de palabras por fragmento (el modelo se entrenó con 384). */
  maxWords: number;
  /**
   * Palabras por ventana de análisis (frases agrupadas); 0 = cada frase por separado. Con model_w8,
   * 24 rinde igual que frase por frase y es más rápido; con 48 se pierden datos en formularios
   * ("Apellido: X / Nombre: Y"). Calibrado con `npm run eval:ia -- --ventana N`.
   */
  windowWords: number;
}

export const DEFAULT_CONFIG: GlinerConfig = { maxWidth: 12, maxTokens: 512, maxWords: 384, windowWords: 24 };

/** Tokenizador del modelo, reducido a lo que GLiNER necesita. */
export interface GlinerTokenizer {
  /** Ids de una palabra sin tokens especiales. */
  encodeWord(word: string): number[];
  clsId: number;
  sepId: number;
}

/** Entradas del modelo para un fragmento (batch de 1). */
export interface GlinerFeeds {
  inputIds: BigInt64Array;
  attentionMask: BigInt64Array;
  wordsMask: BigInt64Array;
  textLengths: BigInt64Array;
  spanIdx: BigInt64Array;
  spanMask: Uint8Array;
  numTokens: number;
  numSpans: number;
}

/** Corre el modelo y devuelve los logits [1, palabras, maxWidth, etiquetas] aplanados. */
export interface GlinerRunner {
  run(feeds: GlinerFeeds): Promise<Float32Array>;
}

export interface Entity {
  label: string;
  /** Posiciones en el texto original (fin exclusivo). */
  start: number;
  end: number;
  score: number;
}

export interface Word {
  text: string;
  start: number;
  end: number;
}

// Como `\w+(?:[-_]\w+)*|\S` de Python: \w incluye letras con tilde y ñ (en JS hace falta \p{L} y la bandera u).
const WORD = /[\p{L}\p{M}\p{N}_]+(?:[-_][\p{L}\p{M}\p{N}_]+)*|\S/gu;

export function splitWords(text: string): Word[] {
  return [...text.matchAll(WORD)].map((m) => ({ text: m[0], start: m.index, end: m.index + m[0].length }));
}

/** Prompt de etiquetas: <<ENT>> persona <<ENT>> dirección … <<SEP>>, ya tokenizado por palabra. */
function promptTokens(labels: string[], tok: GlinerTokenizer): number[][] {
  const words: string[] = [];
  for (const l of labels) words.push('<<ENT>>', l);
  words.push('<<SEP>>');
  return words.map((w) => tok.encodeWord(w));
}

/** Corte duro con superposición, para tramos sin frases (o frases larguísimas). */
function hardSplit(from: number, to: number, wordTokens: number[][], budget: number, maxWords: number, overlap: number): [number, number][] {
  const chunks: [number, number][] = [];
  let start = from;
  while (start < to) {
    let end = start;
    let tokens = 0;
    while (end < to && end - start < maxWords && tokens + wordTokens[end]!.length <= budget) {
      tokens += wordTokens[end]!.length;
      end++;
    }
    if (end === start) end = start + 1; // una "palabra" más larga que el presupuesto: va sola (se trunca)
    chunks.push([start, end]);
    if (end >= to) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks;
}

const SENTENCE_END = new Set(['.', '!', '?', ';', '…']);
const ABBREVIATIONS = new Set(['av', 'avda', 'dr', 'dra', 'sr', 'sra', 'srta', 'lic', 'ing', 'arq', 'prof', 'pje', 'bv', 'nro', 'dpto', 'depto', 'tel', 'cel', 'gral', 'cnel', 'pres', 'ltda', 'cia']);

/**
 * Frases del texto como rangos de palabras. Corta en saltos de línea y en ". " seguido de mayúscula,
 * salvo abreviaturas cortas ("S.A.", "Av.", "Dr.") para no partir nombres ni direcciones.
 */
export function sentenceRanges(text: string, words: Word[]): [number, number][] {
  const ranges: [number, number][] = [];
  let start = 0;
  for (let i = 0; i < words.length - 1; i++) {
    const w = words[i]!;
    const next = words[i + 1]!;
    const gap = text.slice(w.end, next.start);
    const prev = words[i - 1];
    const abbreviation = prev !== undefined && prev.end === w.start && (prev.text.length <= 2 || ABBREVIATIONS.has(prev.text.toLowerCase()));
    const ends = gap.includes('\n') || (SENTENCE_END.has(w.text) && gap.length > 0 && /^\p{Lu}/u.test(next.text) && !abbreviation);
    if (ends) {
      ranges.push([start, i + 1]);
      start = i + 1;
    }
  }
  if (start < words.length) ranges.push([start, words.length]);
  return ranges;
}

/**
 * Fragmentos que se le pasan al modelo: cada frase, o frases agrupadas en ventanas de hasta
 * `windowWords` palabras. Una frase más larga que el máximo se corta con superposición, para no partir
 * una entidad al medio.
 */
export function chunkWords(text: string, words: Word[], wordTokens: number[][], promptLength: number, config: GlinerConfig, overlap = 8): [number, number][] {
  const budget = config.maxTokens - promptLength - 2;
  const window = Math.min(config.windowWords || config.maxWords, config.maxWords);
  const tokensOf = (from: number, to: number) => wordTokens.slice(from, to).reduce((n, t) => n + t.length, 0);
  const chunks: [number, number][] = [];
  let current: [number, number] | null = null;
  for (const [from, to] of sentenceRanges(text, words)) {
    if (to - from > window || tokensOf(from, to) > budget) {
      if (current) chunks.push(current);
      current = null;
      chunks.push(...hardSplit(from, to, wordTokens, budget, window, overlap));
      continue;
    }
    // windowWords 0: cada frase por separado.
    if (current && config.windowWords > 0 && to - current[0] <= window && tokensOf(current[0], to) <= budget) current = [current[0], to];
    else {
      if (current) chunks.push(current);
      current = [from, to];
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/** Arma las entradas del modelo para las palabras [from, to). */
export function buildFeeds(prompt: number[][], wordTokens: number[][], from: number, to: number, config: GlinerConfig, tok: GlinerTokenizer): GlinerFeeds {
  const ids: number[] = [tok.clsId];
  const wordsMask: number[] = [0];
  for (const p of prompt) for (const id of p) (ids.push(id), wordsMask.push(0));
  let wordIndex = 1;
  for (let w = from; w < to; w++) {
    const t = wordTokens[w]!;
    // Solo el primer sub-token de cada palabra la representa ("subtoken_pooling": "first").
    t.forEach((id, k) => {
      ids.push(id);
      wordsMask.push(k === 0 ? wordIndex : 0);
    });
    wordIndex++; // aunque no tenga tokens, para que los índices de palabra sigan alineados
  }
  // Recorta si una palabra gigante excede el máximo (no debería pasar con chunkWords).
  if (ids.length > config.maxTokens - 1) (ids.length = config.maxTokens - 1), (wordsMask.length = config.maxTokens - 1);
  ids.push(tok.sepId);
  wordsMask.push(0);

  const numWords = to - from;
  const numSpans = numWords * config.maxWidth;
  const spanIdx = new BigInt64Array(numSpans * 2);
  const spanMask = new Uint8Array(numSpans);
  for (let i = 0; i < numWords; i++) {
    for (let j = 0; j < config.maxWidth; j++) {
      const k = i * config.maxWidth + j;
      if (i + j < numWords) {
        spanIdx[k * 2] = BigInt(i);
        spanIdx[k * 2 + 1] = BigInt(i + j);
        spanMask[k] = 1;
      }
    }
  }

  return {
    inputIds: BigInt64Array.from(ids, BigInt),
    attentionMask: new BigInt64Array(ids.length).fill(1n),
    wordsMask: BigInt64Array.from(wordsMask, BigInt),
    textLengths: BigInt64Array.from([BigInt(numWords)]),
    spanIdx,
    spanMask,
    numTokens: ids.length,
    numSpans,
  };
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/** Umbral único, o uno por etiqueta. */
export type Threshold = number | Record<string, number>;

/** Logits → entidades candidatas por encima del umbral (sin resolver superposiciones). */
export function decodeSpans(logits: Float32Array, words: Word[], from: number, to: number, labels: string[], config: GlinerConfig, threshold: Threshold): Entity[] {
  const numWords = to - from;
  const numLabels = labels.length;
  const limits = labels.map((l) => (typeof threshold === 'number' ? threshold : (threshold[l] ?? 0.5)));
  const out: Entity[] = [];
  for (let i = 0; i < numWords; i++) {
    for (let j = 0; j < config.maxWidth && i + j < numWords; j++) {
      for (let c = 0; c < numLabels; c++) {
        const score = sigmoid(logits[(i * config.maxWidth + j) * numLabels + c]!);
        if (score < limits[c]!) continue;
        out.push({ label: labels[c]!, start: words[from + i]!.start, end: words[from + i + j]!.end, score });
      }
    }
  }
  return out;
}

/** Búsqueda codiciosa sin superposición: gana la de mayor puntaje (como `flat_ner=True`). */
export function greedyFlat(entities: Entity[]): Entity[] {
  const accepted: Entity[] = [];
  for (const e of [...entities].sort((a, b) => b.score - a.score)) {
    if (!accepted.some((a) => e.start < a.end && a.start < e.end)) accepted.push(e);
  }
  return accepted.sort((a, b) => a.start - b.start);
}

export interface PredictOptions {
  threshold?: Threshold;
  config?: GlinerConfig;
  /** Se llama después de cada fragmento: (hechos, total). */
  onProgress?: (done: number, total: number) => void;
}

/** Busca entidades de las etiquetas dadas en un texto de cualquier largo. */
export async function predict(text: string, labels: string[], tok: GlinerTokenizer, runner: GlinerRunner, options: PredictOptions = {}): Promise<Entity[]> {
  const config = options.config ?? DEFAULT_CONFIG;
  const threshold = options.threshold ?? 0.5;
  const words = splitWords(text);
  if (words.length === 0 || labels.length === 0) return [];

  const prompt = promptTokens(labels, tok);
  const promptLength = prompt.reduce((n, p) => n + p.length, 0);
  const wordTokens = words.map((w) => tok.encodeWord(w.text));
  const chunks = chunkWords(text, words, wordTokens, promptLength, config);

  const found: Entity[] = [];
  for (const [k, [from, to]] of chunks.entries()) {
    const logits = await runner.run(buildFeeds(prompt, wordTokens, from, to, config, tok));
    found.push(...decodeSpans(logits, words, from, to, labels, config, threshold));
    options.onProgress?.(k + 1, chunks.length);
  }
  return greedyFlat(found);
}

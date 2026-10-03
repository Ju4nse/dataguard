import { predict, type GlinerRunner, type GlinerTokenizer, type PredictOptions } from './gliner';
import { entitiesToSpans, LABEL_NAMES, LABEL_THRESHOLDS, type ModelSpan } from './model';

/** Separador entre segmentos al unirlos: corta frases para que el modelo no una entidades de dos segmentos. */
const JOIN = '\n\n';

/**
 * Analiza una lista de segmentos (un documento entero, o los valores de un JSON). Los segmentos
 * cortos se agrupan en un solo texto para no correr el modelo cientos de veces, y después cada
 * entidad vuelve a su segmento. Devuelve los fragmentos de cada segmento, en el mismo orden.
 */
export async function detectInSegments(
  segments: string[],
  tok: GlinerTokenizer,
  runner: GlinerRunner,
  options: Omit<PredictOptions, 'threshold'> & { blockChars?: number; thresholds?: Record<string, number> } = {},
): Promise<ModelSpan[][]> {
  const blockChars = options.blockChars ?? 4000;
  const result: ModelSpan[][] = segments.map(() => []);

  // Bloques de segmentos consecutivos: [índices, texto unido, inicio de cada segmento en el texto].
  const blocks: { ids: number[]; text: string; offsets: number[] }[] = [];
  let current = { ids: [] as number[], text: '', offsets: [] as number[] };
  segments.forEach((seg, i) => {
    if (!seg.trim()) return;
    if (current.ids.length > 0 && current.text.length + JOIN.length + seg.length > blockChars) {
      blocks.push(current);
      current = { ids: [], text: '', offsets: [] };
    }
    if (current.ids.length > 0) current.text += JOIN;
    current.offsets.push(current.text.length);
    current.ids.push(i);
    current.text += seg;
  });
  if (current.ids.length > 0) blocks.push(current);

  // El progreso se informa en caracteres procesados (cada bloque avisa por fragmento).
  const total = blocks.reduce((n, b) => n + b.text.length, 0);
  let doneChars = 0;

  for (const block of blocks) {
    const thresholds = options.thresholds ?? LABEL_THRESHOLDS;
    const entities = await predict(block.text, LABEL_NAMES, tok, runner, {
      ...options,
      threshold: thresholds,
      onProgress: (done, chunks) => options.onProgress?.(doneChars + (block.text.length * done) / chunks, total),
    });
    doneChars += block.text.length;
    for (const span of entitiesToSpans(block.text, entities, thresholds)) {
      // Segmento que contiene la entidad; si cruza el límite entre dos segmentos, se descarta.
      let k = block.offsets.length - 1;
      while (k > 0 && block.offsets[k]! > span.start) k--;
      const segStart = block.offsets[k]!;
      const segIndex = block.ids[k]!;
      const segEnd = segStart + segments[segIndex]!.length;
      if (span.end > segEnd) continue;
      result[segIndex]!.push({ ...span, start: span.start - segStart, end: span.end - segStart });
    }
  }
  return result;
}

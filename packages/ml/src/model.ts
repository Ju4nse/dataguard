import type { Confidence, DetectionType } from '@securedata/shared';
import type { Tokenizer } from '@huggingface/tokenizers';
import type { InferenceSession, Tensor } from 'onnxruntime-web';
import type { Entity, GlinerFeeds, GlinerRunner, GlinerTokenizer } from './gliner';

/**
 * Modelo: GLiNER multilingüe entrenado para datos personales (Apache-2.0), cuantizado "solo pesos"
 * a 8 bits con `scripts/quantize-model.py --plegado` (el int8 de onnx-community cuantiza también
 * las activaciones y pierde casi toda la calidad). Las matrices se pasan a float32 una vez al
 * cargar, así que calcula a velocidad completa. Se descarga una sola vez y queda guardado en el
 * navegador; el texto analizado nunca sale de la computadora.
 */
export const MODEL = {
  id: 'onnx-community/gliner_multi_pii-v1',
  /** Commit fijo del repo en Hugging Face: el deploy genera siempre el mismo modelo. */
  revision: '2e0397a7e8a250d76c37122232b3cbde42c8d629',
  onnx: 'onnx/model_w8p.onnx',
  tokenizer: 'tokenizer.json',
  tokenizerConfig: 'tokenizer_config.json',
  /** Tamaño aproximado de la descarga, para avisar antes de bajarlo. */
  sizeMb: 315,
} as const;

/** Repositorio original en Hugging Face (de ahí salen el tokenizador y el modelo completo). */
export const HF_BASE = `https://huggingface.co/${MODEL.id}/resolve/${MODEL.revision}/`;

/** URL de un archivo del modelo; `base` es la carpeta donde está publicado (termina en "/"). */
export const modelFileUrl = (file: string, base: string = HF_BASE) => `${base}${file}`;

/**
 * Qué le pedimos al modelo y en qué tipo de DataGuard se convierte. Solo lo que las reglas no
 * resuelven bien: lo que tiene formato (DNI, CUIT, CBU, email…) lo detectan las reglas con validación.
 * Las etiquetas van en inglés porque así se entrenó el modelo (funciona igual sobre texto en español).
 */
export const LABELS: Record<string, DetectionType> = {
  person: 'NOMBRE_PERSONA',
  organization: 'RAZON_SOCIAL',
  address: 'DIRECCION',
  'medical condition': 'DATO_SENSIBLE',
};

export const LABEL_NAMES = Object.keys(LABELS);

/**
 * Umbral por etiqueta, calibrado con `npm run calibrar:ia` sobre model_w8: se toma el centro de la
 * meseta de F1, no el borde, para no acomodarse al corpus. "organization" es la más ruidosa
 * (marcas, clubes, áreas internas), por eso pide más.
 */
export const LABEL_THRESHOLDS: Record<string, number> = {
  person: 0.45,
  organization: 0.6,
  address: 0.5,
  'medical condition': 0.5,
};

/** Puntaje del modelo → confianza (relativa al umbral calibrado). Lo dudoso igual se protege, pero queda para revisar. */
export function confidenceFromScore(score: number, threshold = 0.5): Confidence {
  if (score >= threshold + 0.3) return 'alta';
  if (score >= threshold + 0.1) return 'media';
  return 'baja';
}

export interface ModelSpan {
  type: DetectionType;
  start: number;
  end: number;
  value: string;
  confidence: Confidence;
  score: number;
}

/** @param thresholds umbral por etiqueta (por defecto, los calibrados). */
export function entitiesToSpans(text: string, entities: Entity[], thresholds: Record<string, number> = LABEL_THRESHOLDS): ModelSpan[] {
  const spans: ModelSpan[] = [];
  for (const e of entities) {
    const type = LABELS[e.label];
    const threshold = thresholds[e.label] ?? 0.5;
    if (!type || e.score < threshold) continue;
    spans.push({ type, start: e.start, end: e.end, value: text.slice(e.start, e.end), confidence: confidenceFromScore(e.score, threshold), score: e.score });
  }
  return spans;
}

/** Adapta el tokenizador de @huggingface/tokenizers (tokenizer.json de mDeBERTa). */
export function glinerTokenizer(tokenizer: Tokenizer): GlinerTokenizer {
  const id = (t: string) => {
    const v = tokenizer.token_to_id(t);
    if (v === undefined) throw new Error(`El tokenizador no tiene ${t}`);
    return v;
  };
  return {
    encodeWord: (word) => tokenizer.encode(word, { add_special_tokens: false }).ids,
    clsId: id('[CLS]'),
    sepId: id('[SEP]'),
  };
}

/** Corre el modelo con onnxruntime (web o node: comparten la API). */
export function ortRunner(session: InferenceSession, TensorClass: typeof Tensor): GlinerRunner {
  return {
    async run(f: GlinerFeeds) {
      const n = f.numTokens;
      const feeds = {
        input_ids: new TensorClass('int64', f.inputIds, [1, n]),
        attention_mask: new TensorClass('int64', f.attentionMask, [1, n]),
        words_mask: new TensorClass('int64', f.wordsMask, [1, n]),
        text_lengths: new TensorClass('int64', f.textLengths, [1, 1]),
        span_idx: new TensorClass('int64', f.spanIdx, [1, f.numSpans, 2]),
        span_mask: new TensorClass('bool', f.spanMask, [1, f.numSpans]),
      };
      const out = await session.run(feeds);
      const logits = out.logits;
      if (!logits) throw new Error('El modelo no devolvió logits');
      return logits.data as Float32Array;
    },
  };
}

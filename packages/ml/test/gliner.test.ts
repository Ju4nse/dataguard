import { describe, expect, it } from 'vitest';
import { buildFeeds, chunkWords, DEFAULT_CONFIG, detectInSegments, greedyFlat, predict, sentenceRanges, splitWords, type GlinerRunner, type GlinerTokenizer } from '../src';

// Tokenizador de prueba: un token por palabra (dos si la palabra es larga), ids estables.
const vocab = new Map<string, number>();
const fakeTok: GlinerTokenizer = {
  encodeWord: (w) => {
    if (!vocab.has(w)) vocab.set(w, 10 + vocab.size);
    const id = vocab.get(w)!;
    return w.length > 8 ? [id, id] : [id];
  },
  clsId: 1,
  sepId: 2,
};

/**
 * Modelo de prueba: reconstruye las palabras desde los ids (primer sub-token de cada una) y marca
 * como "person" las dos palabras que siguen a una "a" si empiezan con mayúscula.
 */
function fakeRunner(): GlinerRunner {
  const byId = () => new Map([...vocab].map(([w, id]) => [id, w]));
  return {
    async run(f) {
      const numWords = Number(f.textLengths[0]);
      const names = byId();
      const words = [...f.wordsMask].flatMap((m, k) => (m > 0n ? [names.get(Number(f.inputIds[k]))!] : []));
      expect(words.length).toBe(numWords);
      const labels = 4;
      const logits = new Float32Array(numWords * DEFAULT_CONFIG.maxWidth * labels).fill(-10);
      words.forEach((w, i) => {
        if (/^\p{Lu}/u.test(w) && words[i - 1] === 'a') logits[(i * DEFAULT_CONFIG.maxWidth + 1) * labels + 0] = 3; // dos palabras, etiqueta 0
      });
      return logits;
    },
  };
}

describe('splitWords', () => {
  it('no corta palabras con tilde ni ñ', () => {
    expect(splitWords('Gutiérrez y Muñoz, S.A.').map((w) => w.text)).toEqual(['Gutiérrez', 'y', 'Muñoz', ',', 'S', '.', 'A', '.']);
  });
  it('conserva las posiciones en el texto original', () => {
    const text = '  Hola  mundo';
    for (const w of splitWords(text)) expect(text.slice(w.start, w.end)).toBe(w.text);
  });
});

describe('buildFeeds', () => {
  it('marca solo el primer sub-token de cada palabra y arma todos los spans', () => {
    const words = splitWords('Ana Rodríguezzz vive');
    const wt = words.map((w) => fakeTok.encodeWord(w.text));
    const prompt = [[5], [6], [7]];
    const f = buildFeeds(prompt, wt, 0, words.length, DEFAULT_CONFIG, fakeTok);
    // [CLS] + prompt(3) + Ana(1) + Rodríguezzz(2) + vive(1) + [SEP]
    expect(f.numTokens).toBe(1 + 3 + 4 + 1);
    expect([...f.wordsMask].map(Number)).toEqual([0, 0, 0, 0, 1, 2, 0, 3, 0]);
    expect(f.numSpans).toBe(3 * DEFAULT_CONFIG.maxWidth);
    // Spans válidos: (0,0),(0,1),(0,2),(1,1),(1,2),(2,2)
    expect([...f.spanMask].reduce((a, b) => a + b, 0)).toBe(6);
  });
});

describe('sentenceRanges / chunkWords', () => {
  const cut = (text: string) => {
    const words = splitWords(text);
    return sentenceRanges(text, words).map(([a, b]) => text.slice(words[a]!.start, words[b - 1]!.end));
  };

  it('corta en saltos de línea y en punto seguido de mayúscula', () => {
    expect(cut('Hola Ana. Mañana llamo.\nSaludos')).toEqual(['Hola Ana.', 'Mañana llamo.', 'Saludos']);
  });

  it('no corta en abreviaturas como S.A. o Av.', () => {
    expect(cut('Trabaja en Logística Sur S.A. Desde 2020 vive en Av. Belgrano 120.')).toEqual(['Trabaja en Logística Sur S.A. Desde 2020 vive en Av. Belgrano 120.']);
  });

  const long = Array.from({ length: 500 }, (_, i) => `p${i}`).join(' ');
  const text = `Primera frase corta.\nSegunda frase corta.\n${long}`;
  const words = splitWords(text);
  const wt = words.map((w) => fakeTok.encodeWord(w.text));

  it('con windowWords 0 analiza cada frase por separado y corta con superposición las larguísimas', () => {
    const chunks = chunkWords(text, words, wt, 10, { ...DEFAULT_CONFIG, windowWords: 0 });
    expect(chunks.slice(0, 3)).toEqual([
      [0, 4],
      [4, 8],
      [8, 8 + DEFAULT_CONFIG.maxWords],
    ]);
    expect(chunks[3]![0]).toBe(8 + DEFAULT_CONFIG.maxWords - 8);
    expect(chunks.at(-1)![1]).toBe(words.length);
  });

  it('por defecto agrupa frases cortas en ventanas y corta las largas al tamaño de la ventana', () => {
    const w = DEFAULT_CONFIG.windowWords;
    const chunks = chunkWords(text, words, wt, 10, DEFAULT_CONFIG);
    expect(chunks[0]).toEqual([0, 8]);
    expect(chunks[1]).toEqual([8, 8 + w]);
    expect(chunks[2]![0]).toBe(8 + w - 8);
  });
});

describe('greedyFlat', () => {
  it('ante superposición gana el puntaje más alto', () => {
    const r = greedyFlat([
      { label: 'person', start: 0, end: 10, score: 0.7 },
      { label: 'organization', start: 5, end: 15, score: 0.9 },
      { label: 'person', start: 20, end: 25, score: 0.6 },
    ]);
    expect(r.map((e) => e.label)).toEqual(['organization', 'person']);
  });
});

describe('predict / detectInSegments', () => {
  it('devuelve posiciones del texto original', async () => {
    const text = 'Le escribí a Laura Pérez ayer.';
    const spans = await predict(text, ['person', 'organization', 'address', 'medical condition'], fakeTok, fakeRunner());
    expect(spans).toHaveLength(1);
    expect(text.slice(spans[0]!.start, spans[0]!.end)).toBe('Laura Pérez');
  });

  it('agrupa segmentos cortos y devuelve cada entidad en su segmento', async () => {
    const segs = ['Saludos a Juan Paz', '', 'Llamé a Rosa Díaz hoy'];
    const r = await detectInSegments(segs, fakeTok, fakeRunner());
    expect(r[0]!.map((s) => s.value)).toEqual(['Juan Paz']);
    expect(r[1]).toEqual([]);
    expect(r[2]!.map((s) => [s.value, s.type])).toEqual([['Rosa Díaz', 'NOMBRE_PERSONA']]);
    expect(segs[2]!.slice(r[2]![0]!.start, r[2]![0]!.end)).toBe('Rosa Díaz');
  });
});

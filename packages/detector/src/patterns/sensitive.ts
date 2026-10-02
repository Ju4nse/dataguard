import type { Span } from '../types';
import { foldWithMap } from '../terms';

/**
 * "Datos sensibles" según el art. 2 de la Ley 25.326: origen racial o étnico, opiniones políticas,
 * convicciones religiosas, afiliación sindical, salud y vida sexual (más antecedentes penales).
 * Se marcan términos concretos ("diabetes", "afiliado al sindicato"), no las etiquetas genéricas
 * ("diagnóstico:", "religión:"), para que la acción reemplace el dato y no el rótulo.
 * Frases sin tildes y en minúsculas: se comparan contra el texto normalizado.
 */
const PHRASES = {
  salud: [
    'licencia medica', 'licencia por enfermedad', 'licencia psiquiatrica', 'certificado medico', 'certificado de discapacidad',
    'certificado unico de discapacidad', 'enfermedad cronica', 'enfermedad terminal', 'tratamiento medico', 'tratamiento psiquiatrico',
    'tratamiento psicologico', 'tratamiento oncologico', 'internacion psiquiatrica', 'diabetes', 'diabetico', 'diabetica',
    'hipertension', 'hipertenso', 'hipertensa', 'cancer', 'oncologico', 'oncologica', 'quimioterapia', 'vih', 'hiv', 'sida',
    'hepatitis', 'epilepsia', 'epileptico', 'epileptica', 'asma', 'asmatico', 'asmatica', 'depresion', 'trastorno bipolar',
    'trastorno de ansiedad', 'trastorno alimentario', 'trastorno mental', 'esquizofrenia', 'ataque de panico', 'adiccion',
    'alcoholismo', 'drogadiccion', 'embarazo', 'embarazada', 'discapacidad', 'discapacitado', 'discapacitada', 'celiaquia',
    'celiaco', 'celiaca', 'alzheimer', 'parkinson', 'autismo',
  ],
  religion: [
    'catolico', 'catolica', 'evangelico', 'evangelica', 'judio', 'judia', 'musulman', 'musulmana', 'islamico', 'islamica',
    'budista', 'testigo de jehova', 'mormon', 'protestante', 'ateo', 'atea', 'agnostico', 'agnostica', 'cristiano', 'cristiana',
  ],
  politica: [
    'afiliado a un partido', 'afiliada a un partido', 'afiliado al partido', 'afiliada al partido', 'afiliacion partidaria',
    'militante', 'militancia politica', 'peronista', 'kirchnerista', 'macrista',
  ],
  sindical: [
    'afiliado al sindicato', 'afiliada al sindicato', 'afiliado al gremio', 'afiliada al gremio', 'afiliacion sindical',
    'delegado gremial', 'delegada gremial', 'cuota sindical',
  ],
  sexual: ['homosexual', 'heterosexual', 'gay', 'lesbiana', 'bisexual', 'transexual', 'transgenero', 'persona trans', 'vida sexual'],
  etnico: ['afrodescendiente', 'pueblo originario', 'pueblos originarios', 'indigena', 'mapuche', 'qom', 'wichi'],
  penal: ['antecedentes penales', 'condena penal', 'prontuario'],
};

const ALL = Object.values(PHRASES)
  .flat()
  .sort((a, b) => b.length - a.length);
const REGEX = new RegExp(`(?<![a-z0-9])(?:${ALL.map((p) => p.replace(/ /g, '\\s+')).join('|')})(?![a-z0-9])`, 'g');

export function findSensitive(text: string): Span[] {
  const { folded, map } = foldWithMap(text);
  const out: Span[] = [];
  for (const m of folded.matchAll(REGEX)) {
    const after = folded.slice(m.index + m[0].length);
    // "Afiliación sindical: sí" → es un rótulo, el dato es lo que sigue.
    if (/^\s*:/.test(after)) continue;
    const start = map[m.index]!;
    const end = map[m.index + m[0].length - 1]! + 1;
    out.push({ type: 'DATO_SENSIBLE', start, end, value: text.slice(start, end), confidence: 'media' });
  }
  return out;
}

/** Para columnas: ¿el valor menciona un dato sensible? */
export function mentionsSensitive(value: string): boolean {
  return findSensitive(value).length > 0;
}

/**
 * Lo que DataGuard ya protegió: seudónimos ("Persona_01", "Empresa_12" o con un prefijo propio como
 * "Proveedor_03"), marcadores de anonimización ("[DNI]", "[DATO SENSIBLE]") y datos enmascarados
 * ("***@gmail.com", "**** 1234").
 *
 * Un texto ya protegido vuelve a analizarse seguido: el prompt después del reemplazo, una respuesta de
 * la IA pegada en el chat, una planilla depurada que se vuelve a subir. Si esto se detectara de nuevo,
 * Persona_01 pasaría a ser Persona_02 (y la tabla de equivalencias dejaría de servir).
 */
const PSEUDONYM = /^\p{L}[\p{L}\p{N}]*_\d+$/u;
const MARKERS = /\[[\p{Lu} ]+\]|\*{3}@\S+|\*{4} \d{4}/gu;
/** Palabras que pueden acompañar a un seudónimo dentro de lo marcado: "Sra. Persona_02", "Persona_01 y Persona_03". */
// prettier-ignore
const FILLER = new Set(['de', 'del', 'y', 'e', 'o', 'la', 'el', 'los', 'las', 'sr', 'sra', 'srta', 'dr', 'dra', 'lic', 'ing', 'don', 'doña']);

/** `value` es solo seudónimos y marcadores (con, a lo sumo, títulos y conectores): ya está protegido. */
export function isAlreadyProtected(value: string): boolean {
  let found = false;
  const rest = value.replace(MARKERS, () => {
    found = true;
    return ' ';
  });
  for (const raw of rest.split(/[\s,;:/()"'«»]+/)) {
    const word = raw.replace(/^[¿¡.]+|[.!?]+$/g, '');
    if (!word) continue;
    if (PSEUDONYM.test(word)) found = true;
    else if (!FILLER.has(word.toLowerCase())) return false;
  }
  return found;
}

const WORD_CHAR = /[\p{L}\p{N}_]/u;

/**
 * Lo marcado en `text` entre `start` y `end` ya está protegido, mirando también la palabra entera:
 * una regla puede quedarse con "Persona" de "Sra. Persona_01" porque corta en el guion bajo.
 */
export function isProtectedSpan(text: string, start: number, end: number): boolean {
  let a = start;
  let b = end;
  while (a > 0 && WORD_CHAR.test(text[a - 1]!)) a--;
  while (b < text.length && WORD_CHAR.test(text[b]!)) b++;
  return isAlreadyProtected(text.slice(start, end)) || isAlreadyProtected(text.slice(a, b));
}

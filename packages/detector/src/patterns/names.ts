import type { Confidence } from '@securedata/shared';
import type { Span } from '../types';
import { fold } from '../terms';

/**
 * Detección de nombres de personas sin modelos de IA: diccionario de nombres de pila frecuentes
 * en Argentina + títulos (Sr., Dra., Lic.) + frases de contexto ("representada por", "paciente").
 * Los nombres que también son lugares o palabras comunes (Rosario, Mercedes, Paz) exigen más evidencia.
 */

// Nombres de pila frecuentes (sin tildes, en minúsculas).
const FIRST_NAMES = new Set(
  `juan jose carlos luis jorge miguel pedro pablo diego martin santiago matias nicolas lucas tomas facundo federico francisco
  gonzalo sebastian alejandro andres fernando gustavo hernan hugo ignacio javier joaquin julian leandro leonardo lorenzo manuel
  marcelo marcos mariano mario mateo maximiliano nahuel oscar patricio ramiro raul ricardo roberto rodrigo ruben sergio walter
  agustin alberto alfredo alan alvaro antonio ariel armando augusto benjamin bruno camilo cesar claudio cristian damian daniel
  dario david eduardo emiliano enrique ernesto esteban ezequiel fabian felipe gabriel german guillermo hector horacio ivan
  jonathan lautaro lisandro luciano maximo mauricio norberto omar orlando osvaldo ramon renzo rafael rolando samuel simon thiago
  valentin victor vicente adrian aldo bautista benicio ciro elias emanuel enzo eric eugenio fausto gaston gerardo gregorio ian
  isaac jeremias octavio pascual reinaldo rogelio santino teo tobias ulises alexis axel braian brian cristobal dylan elian
  emilio fermin franco gael hernan joel jonas kevin leon marco mauro milton nestor nehuen pedro rene tadeo uriel
  maria ana laura lucia sofia valentina camila martina julieta florencia agustina micaela carolina gabriela paula andrea silvia
  patricia claudia monica susana graciela marta norma beatriz alicia cristina liliana mirta adriana alejandra natalia veronica
  romina mariana lorena daniela fernanda soledad cecilia eugenia jimena josefina juliana luciana milagros noelia pilar rocio
  sabrina tamara vanesa virginia yanina abril antonella brenda candela catalina delfina emilia guadalupe isabella jazmin lara
  lourdes malena morena nadia olivia renata sol tatiana zoe ines irene elena elsa estela gladys haydee hilda isabel juana
  leticia luisa mabel magdalena marcela margarita mercedes miriam nelida nora olga raquel rosa rosana sandra sara silvina stella
  teresa victoria viviana ximena yolanda belen clara constanza estefania ivana jesica karina melina melisa milena pamela priscila
  rebeca sonia tania agostina aylen bianca celeste gisela ludmila maite mia valeria lujan dolores paz rosario esperanza consuelo
  gloria luz anabella analia barbara carla debora denise eliana erica evangelina fabiana gimena ivonne johanna lidia lucrecia
  maia marina mayra miranda nerea pia selene vanina vera yamila`
    .split(/\s+/)
    .filter(Boolean),
);

/** Nombres que también son lugares o palabras comunes: necesitan apellido y no estar después de "en", "de"… */
const AMBIGUOUS = new Set(
  `rosario mercedes victoria pilar lujan dolores belen paz esperanza consuelo gloria luz sol soledad milagros clara celeste
  franco marco leon santiago rosa morena abril guadalupe candela mia lourdes`
    .split(/\s+/)
    .filter(Boolean),
);

/** Palabras con mayúscula que siguen a un nombre de pila pero no son apellidos. */
const NOT_SURNAME = new Set(
  `central norte sur este oeste capital federal nacional provincial benz sa srl sas hnos hermanos argentina argentino
  buenos aires lunes martes miercoles jueves viernes sabado domingo enero febrero marzo abril mayo junio julio agosto
  septiembre setiembre octubre noviembre diciembre area comercial ventas compras finanzas marketing sistemas operaciones rrhh
  legales gerencia direccion administracion equipo cliente clientes proveedor proveedores empresa contrato anexo clausula
  articulo ley dni cuit cuil cbu cvu tel cel email mail legajo gerente director directora presidente jefe jefa encargado
  encargada responsable coordinador coordinadora supervisor supervisora analista asistente sucursal oficina planta deposito
  primera segunda tercera cuarta quinta el la los las un una y o de del al en con por para sin sobre entre`
    .split(/\s+/)
    .filter(Boolean),
);

/** Títulos que anteceden a un nombre (sin el punto). */
const TITLES = new Set(
  `sr sra srta dr dra lic ing arq prof cr cra cdor cdora senor senora don dona doctor doctora licenciado licenciada ingeniero
  ingeniera profesor profesora contador contadora`
    .split(/\s+/)
    .filter(Boolean),
);

/** Palabras que, justo antes de un nombre de pila, indican que es un lugar o una calle: "San Martín", "Calle Juan B. Justo". */
const PLACE_BEFORE = new Set(
  `san santa santo calle av avda avenida bv boulevard bulevar pasaje pje plaza barrio estacion colegio escuela hospital club
  fundacion universidad instituto teatro parque ruta diagonal villa puerto general`
    .split(/\s+/)
    .filter(Boolean),
);

/**
 * Preposiciones de lugar: antes de un nombre ambiguo indican que es un lugar ("en Santiago del Estero").
 * "a" y "de" no entran: "Escribile a Victoria Gutiérrez" es una persona.
 */
// prettier-ignore
const PLACE_PREPOSITIONS = new Set(['en', 'desde', 'hasta', 'hacia']);

/** Una palabra (o dos) antes del nombre que indican que lo que sigue es una persona. */
const CONTEXT_SINGLE = new Set(
  `paciente empleado empleada titular apoderado apoderada contacto solicitante beneficiario beneficiaria afiliado afiliada
  firmante destinatario destinataria remitente denunciante`
    .split(/\s+/)
    .filter(Boolean),
);
// prettier-ignore
const CONTEXT_BY = new Set(['representado', 'representada', 'firmado', 'firmada', 'atendido', 'atendida', 'autorizado', 'autorizada']);

// prettier-ignore
const CONNECTORS = new Set(['de', 'del', 'la', 'las', 'los', 'di', 'da', 'van', 'von']);

interface Token {
  word: string;
  folded: string;
  start: number;
  end: number;
}

const isCap = (w: string) => /^\p{Lu}/u.test(w);
const isAllCaps = (w: string) => w.length > 1 && w === w.toUpperCase() && /\p{Lu}/u.test(w);

function tokenize(text: string): Token[] {
  return [...text.matchAll(/\p{L}[\p{L}'’]*/gu)].map((m) => ({ word: m[0], folded: fold(m[0]), start: m.index, end: m.index + m[0].length }));
}

export function isFirstName(word: string): boolean {
  return FIRST_NAMES.has(fold(word));
}

/** ¿El valor de una celda parece un nombre de persona? ("Juan Pérez", "PEREZ, JUAN", "María José Gómez") */
export function isPersonNameValue(value: string): boolean {
  const words = value
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean);
  if (words.length < 2 || words.length > 5) return false;
  if (!words.every((w) => /^\p{L}[\p{L}'’.-]*$/u.test(w))) return false;
  if (words.some((w) => NOT_SURNAME.has(fold(w)) && !CONNECTORS.has(fold(w)))) return false;
  return words.some((w) => FIRST_NAMES.has(fold(w)) && !AMBIGUOUS.has(fold(w))) || words.filter((w) => FIRST_NAMES.has(fold(w))).length >= 2;
}

/** Palabras que pueden seguir a "soy" y no son un nombre (aunque empiecen como uno: "soy analista"). */
// prettier-ignore
const NOT_INTRO_NAME = new Set(['yo', 'el', 'la', 'un', 'una', 'de', 'del', 'muy', 'nuevo', 'nueva', 'responsable', 'encargado', 'encargada']);

/**
 * ¿El token i empieza un nombre después de una presentación? Devuelve desde qué token va el nombre.
 * - Fuerte ("me llamo", "mi nombre es"): lo que sigue es el nombre aunque esté en minúscula o sea un apodo.
 * - "soy": solo si sigue un nombre del diccionario, una palabra con mayúscula o un apodo que empieza
 *   como un nombre ("juanse", "marianito"); "soy contador" no.
 */
function introduction(tokens: Token[], i: number, gap: (a: Token, b: Token) => string): { from: number; strong: boolean } | null {
  const t = tokens[i]!;
  const next = tokens[i + 1];
  if (!next || !/^[ \t]*:?[ \t]+$/.test(gap(t, next)) || NOT_SURNAME.has(next.folded) || NOT_INTRO_NAME.has(next.folded)) return null;
  const prev = tokens[i - 1];
  const prev2 = tokens[i - 2];
  const strong = (t.folded === 'llamo' && prev?.folded === 'me') || (t.folded === 'es' && prev?.folded === 'nombre' && prev2?.folded === 'mi');
  if (strong) return { from: i + 1, strong };
  if (t.folded !== 'soy') return null;
  const w = next.folded;
  const nickname = [...FIRST_NAMES].some((n) => n.length >= 4 && w.length > n.length && w.startsWith(n));
  const known = FIRST_NAMES.has(w) && !(AMBIGUOUS.has(w) && !isCap(next.word));
  return known || nickname || (isCap(next.word) && !CONTEXT_SINGLE.has(w)) ? { from: i + 1, strong: false } : null;
}

/** Hasta dos palabras más después de la primera del nombre: con mayúscula, o en minúscula si la primera es un nombre conocido ("juan perez"). */
function collectIntroName(tokens: Token[], from: number, gap: (a: Token, b: Token) => string): number {
  let last = from;
  const firstKnown = FIRST_NAMES.has(tokens[from]!.folded);
  for (let j = from + 1; j < tokens.length && j <= from + 2; j++) {
    const t = tokens[j]!;
    if (!/^[ \t]+$/.test(gap(tokens[j - 1]!, t)) || NOT_SURNAME.has(t.folded) || NOT_INTRO_NAME.has(t.folded)) break;
    if (!isCap(t.word) && !firstKnown) break;
    last = j;
  }
  return last;
}

/** Nombre de pila solo, sin apellido ("Lucía", "Milagros"). */
export interface LoneFirstName {
  span: Span;
  /** También es un lugar o una palabra común (Milagros, Rosario, Paz): necesita más evidencia. */
  ambiguous: boolean;
  /** Es un campo de una lista o ficha: al principio del renglón o entre comas, "|" o ";". */
  field: boolean;
}

/** Nombres de pila del diccionario, con mayúscula, que no forman parte de un nombre completo ni de un lugar. */
export function findLoneFirstNames(text: string): LoneFirstName[] {
  const tokens = tokenize(text);
  const out: LoneFirstName[] = [];
  tokens.forEach((t, i) => {
    if (!isCap(t.word) || isAllCaps(t.word) || !FIRST_NAMES.has(t.folded)) return;
    const prev = tokens[i - 1];
    const before = text.slice(prev ? prev.end : 0, t.start);
    if (prev && /^\.?[ \t]+$/.test(before) && (PLACE_BEFORE.has(prev.folded) || PLACE_PREPOSITIONS.has(prev.folded))) return;
    const after = text.slice(t.end).match(/^[^\p{L}\d]*/u)![0];
    const field = /(?:^|[\n,;|:])[ \t]*$/.test(text.slice(0, t.start)) && /^[ \t]*(?:[,;|\n]|$)/.test(after);
    out.push({
      span: { type: 'NOMBRE_PERSONA', start: t.start, end: t.end, value: t.word, confidence: 'baja' },
      ambiguous: AMBIGUOUS.has(t.folded),
      field,
    });
  });
  return out;
}

export function findNames(text: string): Span[] {
  const tokens = tokenize(text);
  const out: Span[] = [];
  const gap = (a: Token, b: Token) => text.slice(a.end, b.start);
  const spaceGap = (a: Token, b: Token) => /^[ \t]+$/.test(gap(a, b));
  const sameStyle = (ref: string, w: string) => (isAllCaps(ref) ? isAllCaps(w) : isCap(w));

  /** Desde el token i, junta palabras que pueden ser parte de un nombre (con mayúscula, conectores "de la", iniciales "B."). */
  const collectName = (i: number, ref: string): number => {
    let last = i - 1;
    let j = i;
    while (j < tokens.length) {
      const t = tokens[j]!;
      const prev = tokens[j - 1];
      if (j > i && prev) {
        const g = gap(prev, t);
        const afterInitial = prev.word.length === 1 && /^\.[ \t]+$/.test(g);
        if (!/^[ \t]+$/.test(g) && !afterInitial) break;
      }
      if (CONNECTORS.has(t.word) && j > i) {
        j++;
        continue;
      }
      if (!sameStyle(ref, t.word) || NOT_SURNAME.has(t.folded)) break;
      last = j;
      j++;
      if (j - i > 5) break;
    }
    // No terminar en un conector ("Juan de").
    while (last >= i && CONNECTORS.has(tokens[last]!.word)) last--;
    return last;
  };

  const push = (from: number, to: number, confidence: Confidence) => {
    if (to < from) return;
    out.push({ type: 'NOMBRE_PERSONA', start: tokens[from]!.start, end: tokens[to]!.end, value: text.slice(tokens[from]!.start, tokens[to]!.end), confidence });
  };

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    const prev = tokens[i - 1];
    const next = tokens[i + 1];

    // 1) Título + nombre: "Dra. Silvia Benítez", "Sr. Ramírez".
    if (TITLES.has(t.folded) && next && /^\.?[ \t]+$/.test(gap(t, next)) && isCap(next.word) && !NOT_SURNAME.has(next.folded)) {
      const last = collectName(i + 1, next.word);
      if (last >= i + 1) {
        push(i + 1, last, 'alta');
        i = last;
        continue;
      }
    }

    // 2) Contexto + dos o más palabras con mayúscula: "La paciente Gómez Valentina", "representada por Martín Sosa".
    const isContext =
      (CONTEXT_SINGLE.has(t.folded) && next && /^:?[ \t]+$/.test(gap(t, next))) ||
      (t.folded === 'por' && prev && CONTEXT_BY.has(prev.folded) && next && spaceGap(t, next));
    if (isContext && next && isCap(next.word) && !NOT_SURNAME.has(next.folded)) {
      const last = collectName(i + 1, next.word);
      const words = tokens.slice(i + 1, last + 1).filter((x) => !CONNECTORS.has(x.word));
      if (words.length >= 2 || (words.length === 1 && isFirstName(words[0]!.word))) {
        push(i + 1, last, words.some((w) => FIRST_NAMES.has(w.folded)) ? 'alta' : 'media');
        i = last;
        continue;
      }
    }

    // 2b) Presentaciones: "me llamo juanse", "mi nombre es Ana Gómez", "hola, soy Juan".
    const intro = introduction(tokens, i, gap);
    if (intro) {
      const last = collectIntroName(tokens, intro.from, gap);
      if (last >= intro.from) {
        push(intro.from, last, intro.strong ? 'alta' : 'media');
        i = last;
        continue;
      }
    }

    // 3) Nombre de pila del diccionario.
    if (!isCap(t.word) || !FIRST_NAMES.has(t.folded)) continue;
    if (prev && spaceGap(prev, t) && PLACE_BEFORE.has(prev.folded)) continue;
    if (prev && /^\.[ \t]+$/.test(gap(prev, t)) && PLACE_BEFORE.has(prev.folded)) continue;
    const ambiguous = AMBIGUOUS.has(t.folded);
    if (ambiguous && prev && spaceGap(prev, t) && PLACE_PREPOSITIONS.has(prev.folded)) continue;

    // 3a) "Apellido, Nombre" / "Benítez Acosta, Julieta": apellidos antes de la coma.
    let from = i;
    const beforeComma = prev && /^,[ \t]*$/.test(gap(prev, t)) ? i - 1 : -1;
    if (beforeComma >= 0) {
      let k = beforeComma;
      while (
        k >= 0 &&
        k > beforeComma - 2 &&
        isCap(tokens[k]!.word) &&
        !FIRST_NAMES.has(tokens[k]!.folded) &&
        !NOT_SURNAME.has(tokens[k]!.folded) &&
        (k === beforeComma || spaceGap(tokens[k]!, tokens[k + 1]!))
      )
        k--;
      if (k < beforeComma) from = k + 1;
    }

    const last = collectName(i, t.word);
    const words = tokens.slice(i, last + 1).filter((x) => !CONNECTORS.has(x.word));
    const surnames = words.filter((w) => !FIRST_NAMES.has(w.folded)).length;
    const firstNames = words.length - surnames;
    const hasSurname = surnames > 0 || from < i;

    if (hasSurname || firstNames >= 2) {
      if (ambiguous && !hasSurname) continue;
      push(from, last, ambiguous ? 'baja' : 'media');
      i = last;
    }
  }
  return out;
}

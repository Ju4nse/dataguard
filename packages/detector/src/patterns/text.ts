import type { Confidence, DetectionType } from '@securedata/shared';
import { isValidCbu } from '../validators/cbu';
import { isValidCuit } from '../validators/cuit';
import { isValidDni } from '../validators/dni';
import { isValidCard } from '../validators/luhn';
import { onlyDigits } from '../util';
import { isIp, isPhone } from './values';

export interface TextPattern {
  type: DetectionType;
  /** Debe tener la bandera `g`. */
  regex: RegExp;
  /** `before` son los ~40 caracteres anteriores al hallazgo, para exigir (o descartar por) contexto. */
  validate: (match: string, before: string) => boolean;
  /** Recorta lo que sobra en los bordes del hallazgo (devuelve una parte de él); null lo descarta. */
  refine?: (match: string) => string | null;
  /** Confianza del hallazgo; por defecto 'alta'. */
  confidence?: (match: string, before: string) => Confidence;
  /** Ante superposición gana la prioridad más alta. */
  priority: number;
}

const SOCIETY = String.raw`(?:S\.?\s?A\.?\s?U\.?|S\.?\s?R\.?\s?L\.?|S\.?\s?A\.?\s?S\.?|S\.?\s?A\.?)`;
const SOCIETY_AT_END = new RegExp(`${SOCIETY}$`, 'u');

/** Palabras que pueden ir con mayúscula por empezar la oración (o por estar todo en mayúsculas) pero no son parte del nombre. */
const LEADING_STOPWORDS = new Set([
  'entre', 'el', 'la', 'los', 'las', 'con', 'por', 'para', 'segun', 'según', 'y', 'e', 'en', 'al', 'a', 'de', 'del',
  'sr', 'sra', 'señor', 'señora', 'empresa', 'cliente', 'proveedor', 'firma', 'firmamos', 'contrato', 'servicios', 'que', 'su', 'sus',
]);

function stripLeadingStopwords(match: string): string | null {
  let rest = match;
  for (;;) {
    const word = rest.match(/^(\p{L}+)[ \t]+/u);
    if (!word || !LEADING_STOPWORDS.has(word[1]!.toLowerCase())) break;
    rest = rest.slice(word[0].length);
  }
  // "Uno SA." → el punto es de la oración; "Uno S.A." → el punto es parte de la sigla.
  const suffix = rest.match(SOCIETY_AT_END)?.[0] ?? '';
  if (suffix.endsWith('.') && !suffix.slice(0, -1).includes('.')) rest = rest.slice(0, -1);
  // Tiene que quedar al menos una palabra con mayúscula antes de la forma societaria.
  const name = rest.replace(SOCIETY_AT_END, '').trim();
  return /^\p{Lu}/u.test(name) ? rest : null;
}

// ---------- Contextos ----------
/**
 * La palabra clave tiene que estar cerca y en el mismo "campo": no cruza saltos de línea, "|" ni ";",
 * ni pasa a otro rótulo ("DNI 27.345.901 | Sueldo: $ 1.420.000" → el monto no es un DNI).
 */
function near(words: string, window = 25): { test: (before: string) => boolean } {
  const re = new RegExp(`(?<![\\p{L}\\d])(?:${words})(?![\\p{L}\\d])`, 'giu');
  return {
    test(before) {
      let last: RegExpMatchArray | undefined;
      for (const m of before.matchAll(re)) last = m;
      if (!last) return false;
      const between = before.slice(last.index! + last[0].length);
      // Otro valor y después otro rótulo ("27.345.901, Sueldo:") = otro campo. "Remuneración acordada:" sigue siendo el mismo.
      return between.length <= window && !/[\n|;]/.test(between) && !/[\d,].*\s\p{L}+\s*:/u.test(between);
    },
  };
}
const DNI_CONTEXT = near(String.raw`dni|d\.\s?n\.\s?i\.?|documento|doc|nro\.? de doc`);
const PHONE_CONTEXT = near(String.raw`tel|tel[eé]fono|cel|celular|m[oó]vil|whatsapp|wsp|llamar|llamame|contacto|fijo`);
const PATENTE_CONTEXT = near('patente|dominio', 45);
const CARD_CONTEXT = near(String.raw`tarjeta|visa|master(?:card)?|amex|american express|cr[eé]dito|d[eé]bito|naranja|cabal`);
const BIRTH_CONTEXT = near(String.raw`nacid[oa]|naci[oó]|nacimiento|f\.?\s?nac\.?|fec\.?\s?nac\.?|dob|born`);
const SALARY_CONTEXT = near(String.raw`sueldo|salario|remuneraci[oó]n|haberes|honorarios|cobra|gana|bruto|neto|aguinaldo`);
const IP_CONTEXT = near('ip|servidor|server|host|atacante|origen|destino');
const PASSPORT_CONTEXT = near('pasaporte|passport');
/** Antes de un número: indica que es un identificador interno, no un dato personal. */
const NEGATIVE_CONTEXT = /\b(?:pedido|orden|factura|fact|remito|ticket|comprobante|c[oó]digo|cod|art[ií]culo|art|expediente|operaci[oó]n|transacci[oó]n|referencia|ref|legajo|serie|lote|sku|cae|cp|c[oó]digo postal|nro de cliente|versi[oó]n)\.?\s*(?:n[°ºro.]*\s*)?[:#]?\s*$/i;
const VERSION_BEFORE = /(?:versi[oó]n|\bv)\s*$/i;

const MONTHS = 'enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre';

export const TEXT_PATTERNS: TextPattern[] = [
  {
    type: 'EMAIL',
    regex: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
    // En "postgres://usuario:clave@host" lo que precede a la @ es una contraseña, no un email.
    validate: (_m, before) => !/:\/\/[^\s/@]*:?$/.test(before),
    priority: 100,
  },
  {
    // Tokens con formato conocido: OpenAI, Anthropic, AWS, GitHub, Google, Slack, Stripe, JWT, claves privadas.
    type: 'CREDENCIAL',
    regex: new RegExp(
      [
        String.raw`\bsk-ant-[A-Za-z0-9_-]{20,}`,
        String.raw`\bsk-(?:proj-|live-|test-)?[A-Za-z0-9_-]{20,}`,
        String.raw`\b(?:AKIA|ASIA)[0-9A-Z]{16}\b`,
        String.raw`\bgh[pousr]_[A-Za-z0-9]{36,}\b`,
        String.raw`\bgithub_pat_[A-Za-z0-9_]{22,}\b`,
        String.raw`\bAIza[0-9A-Za-z_-]{35}\b`,
        String.raw`\bxox[abprs]-[A-Za-z0-9-]{10,}\b`,
        String.raw`\b[sr]k_(?:live|test)_[A-Za-z0-9]{16,}\b`,
        String.raw`\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}`,
        String.raw`-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----[\s\S]+?-----END (?:[A-Z]+ )*PRIVATE KEY-----`,
      ].join('|'),
      'g',
    ),
    validate: () => true,
    priority: 97,
  },
  {
    // Contraseña dentro de una URL de conexión: postgres://admin:CLAVE@host
    type: 'CREDENCIAL',
    regex: /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:[^\s@/]+@/gi,
    validate: () => true,
    refine: (m) => m.match(/:\/\/[^\s:/@]+:([^\s@/]+)@/)?.[1] ?? null,
    priority: 96,
  },
  {
    // Asignaciones en código o configuración: password = "…", api_key: …, contraseña: …
    type: 'CREDENCIAL',
    regex: /(?:password|passwd|pwd|pass|contrase[ñn]a|clave|secret|secreto|token|api[_-]?key|apikey|client[_-]?secret)["']?\s*[:=]\s*["']?[^\s"',;]{6,}/gi,
    validate: (m) => {
      const value = m.replace(/^[^:=]*[:=]\s*["']?/, '');
      return !/^(?:x+|\*+|<.*>|\$\{.*\}|tu[_-]?|your[_-]?|changeme|password)$/i.test(value);
    },
    refine: (m) => m.replace(/^[^:=]*[:=]\s*["']?/, '') || null,
    confidence: () => 'media',
    priority: 94,
  },
  {
    type: 'CBU_CVU',
    regex: /(?<!\d)\d{8}[\s-]?\d{14}(?!\d)/g,
    validate: (m) => isValidCbu(m),
    priority: 90,
  },
  {
    // Alias de CBU/CVU: "alias perro.casa.sol". Solo con la palabra "alias" delante.
    type: 'CBU_CVU',
    // Puede terminar en punto de oración ("alias ferre.central.mp.") pero no seguir con más caracteres del alias.
    regex: /(?<=\balias(?:\s+(?:cbu|cvu|de\s+cbu|del\s+cbu))?\s*[:\-]?\s*)[A-Za-z0-9][A-Za-z0-9.-]{4,18}[A-Za-z0-9](?![A-Za-z0-9-]|\.[A-Za-z0-9])/gi,
    validate: (m) => /[.\-\d]/.test(m),
    confidence: () => 'media',
    priority: 88,
  },
  {
    type: 'TARJETA',
    regex: /(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)/g,
    validate: (m, before) => isValidCard(m) && !NEGATIVE_CONTEXT.test(before),
    // Con contexto ("tarjeta", "visa") o agrupada de a 4 es casi seguro; suelta, puede ser otro número que pasa Luhn.
    confidence: (m, before) => (CARD_CONTEXT.test(before) || /^\d{4}([ -])\d{4}\1\d{4}/.test(m) ? 'alta' : 'media'),
    priority: 85,
  },
  {
    type: 'CUIT_CUIL',
    regex: /(?<!\d)\d{2}[-\s.]?\d{8}[-\s.]?\d(?!\d)/g,
    validate: (m) => isValidCuit(m),
    priority: 80,
  },
  {
    type: 'IP',
    regex: /(?<![\d.])(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?![\d.]?\d)/g,
    validate: (m, before) => isIp(m) && !VERSION_BEFORE.test(before),
    confidence: (_m, before) => (IP_CONTEXT.test(before) ? 'alta' : 'media'),
    priority: 72,
  },
  {
    type: 'DNI',
    regex: /(?<![\d.])\d{1,2}\.?\d{3}\.?\d{3}(?![\d.]?\d)/g,
    // Sin la palabra "DNI" o "documento" cerca, 8 dígitos sueltos pueden ser un monto o un código.
    validate: (m, before) => isValidDni(m) && DNI_CONTEXT.test(before) && !NEGATIVE_CONTEXT.test(before) && !/\$\s*$/.test(before),
    priority: 70,
  },
  {
    type: 'FECHA_NACIMIENTO',
    regex: new RegExp(
      String.raw`(?<!\d)(?:\d{1,2}[/.-]\d{1,2}[/.-](?:19|20)\d{2}|(?:19|20)\d{2}-\d{2}-\d{2}|\d{1,2}\s+de\s+(?:${MONTHS})\s+(?:de\s+|del\s+)?(?:19|20)\d{2})(?!\d)`,
      'gi',
    ),
    validate: (_m, before) => BIRTH_CONTEXT.test(before),
    priority: 66,
  },
  {
    type: 'PASAPORTE',
    regex: /(?<![A-Z0-9])[A-Z]{3}\d{6}(?![A-Z0-9])/g,
    validate: (_m, before) => PASSPORT_CONTEXT.test(before),
    priority: 65,
  },
  {
    type: 'TELEFONO',
    // No puede seguir "-dígito": "20-12345678-5" es un CUIT (aunque inválido), no un teléfono.
    regex: /(?<![\w+])(?:\+?54[\s.-]?)?(?:9[\s.-]?)?(?:\(?0?\d{2,4}\)?[\s.-]?)?(?:15[\s.-]?)?\d{2,4}[\s.-]?\d{4,6}(?![\w]|[.-]\d)/g,
    validate: (m, before) => {
      if (NEGATIVE_CONTEXT.test(before)) return false;
      const s = m.trim();
      const d = onlyDigits(s);
      const context = PHONE_CONTEXT.test(before);
      // Con "tel:" delante se aceptan números locales de 8 dígitos ("4567-8901").
      if (context && d.length === 8 && /[\s.-]/.test(s)) return true;
      if (!isPhone(s)) return false;
      return s.startsWith('+54') || /[\s.()-]/.test(s) || context;
    },
    confidence: (m, before) => (PHONE_CONTEXT.test(before) || m.trim().startsWith('+54') ? 'alta' : 'media'),
    priority: 60,
  },
  {
    // Montos con contexto de sueldo: "sueldo bruto de $ 1.850.000", "remuneración: 2.300.000 pesos".
    type: 'SALARIO',
    regex: /\$\s?\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\$\s?\d{4,}(?:,\d{1,2})?|(?<![\d.])\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?\s?(?:pesos|ARS|USD|d[oó]lares)\b/gi,
    validate: (_m, before) => SALARY_CONTEXT.test(before),
    confidence: () => 'media',
    priority: 58,
  },
  {
    // "45 años de edad" → "45 años"; "Edad: 67" → "67".
    type: 'EDAD',
    regex: /(?<!\d)\d{1,3}\s+años(?=\s+de\s+edad)|(?<=\bedad\s*[:=]?\s*)\d{1,3}(?!\d)/gi,
    validate: (m) => Number(onlyDigits(m)) > 0 && Number(onlyDigits(m)) < 120,
    priority: 55,
  },
  {
    type: 'PATENTE',
    regex: /\b(?:[A-Z]{3}\s?\d{3}|[A-Z]{2}\s?\d{3}\s?[A-Z]{2})\b/g,
    validate: (_m, before) => PATENTE_CONTEXT.test(before),
    priority: 50,
  },
  {
    // "Av. Corrientes 1234", "Calle San Martín 455", "Bv. Oroño 1500". Sin prefijo de calle no se puede distinguir de otras cosas.
    type: 'DIRECCION',
    regex: /(?<!\p{L})(?:Av(?:da)?\.?|Avenida|Calle|Bv\.?|Boulevard|Bulevar|Pje\.?|Pasaje|Diag\.?|Diagonal|Ruta)[ \t]+(?:(?:\p{Lu}[\p{L}.]*|de|del|la|los|las|\d{1,2})[ \t]+){1,5}(?:N[°ºo]\.?[ \t]*)?\d{1,5}(?!\d)/gu,
    validate: () => true,
    confidence: () => 'media',
    priority: 45,
  },
  {
    // Palabras con mayúscula (en la misma línea) seguidas de una forma societaria: "Distribuidora del Sur S.R.L.", "Álvarez Hnos SA".
    type: 'RAZON_SOCIAL',
    regex: new RegExp(`(?<!\\p{L})(?:\\p{Lu}[\\p{L}&'-]*[ \\t]+(?:(?:de|del|la|las|los|y|e)[ \\t]+)?){1,5}${SOCIETY}(?!\\p{L})`, 'gu'),
    validate: () => true,
    refine: stripLeadingStopwords,
    priority: 40,
  },
];

/** Prioridades de los detectores que no son una sola expresión regular. */
export const NAME_PRIORITY = 35;
export const SENSITIVE_PRIORITY = 30;

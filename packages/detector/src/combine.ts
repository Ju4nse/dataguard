import type { Confidence, DetectionType } from '@securedata/shared';
import { isFirstName } from './patterns/names';
import { fold } from './terms';
import type { Span } from './types';

/**
 * Tipos que las reglas resuelven con certeza (formato verificable, o diccionario de datos sensibles
 * de la Ley 25.326): si una regla los encontró, el modelo no los pisa.
 */
const STRUCTURED = new Set<DetectionType>([
  'EMAIL', 'TELEFONO', 'DNI', 'CUIT_CUIL', 'CBU_CVU', 'TARJETA', 'PATENTE', 'PASAPORTE', 'IP', 'CREDENCIAL',
  'FECHA_NACIMIENTO', 'EDAD', 'SALARIO', 'DATO_SENSIBLE',
]);

const RANK: Record<Confidence, number> = { baja: 1, media: 2, alta: 3 };

const STREET_START = /^(?:calle|av(?:da)?\.?|avenida|pasaje|pje\.?|ruta|bv\.?|boulevard|bulevar|diagonal|diag\.?)\s/i;
const SOCIETY_WORD = /^(?:s\.?a\.?u?|s\.?r\.?l|s\.?a\.?s|s\.?h|cv|de|del|y|e|la|el|los|las)\.?$/i;
/** Provincias y ciudades grandes: un "nombre" o "empresa" que es solo esto es un lugar, no un dato personal. */
const PLACES = new Set(
  (
    'argentina buenos aires caba capital federal catamarca chaco chubut córdoba cordoba corrientes entre ríos rios formosa jujuy ' +
    'la pampa rioja mendoza misiones neuquén neuquen río negro rio salta san juan luis santa cruz fe santiago del estero ' +
    'tierra fuego tucumán tucuman rosario mar plata bahía bahia blanca paraná parana resistencia posadas ushuaia'
  ).split(' '),
);

const words = (s: string) => s.split(/[\s,/]+/).filter(Boolean);
const DETERMINERS = new Set(['el', 'la', 'los', 'las', 'un', 'una', 'del', 'al', 'este', 'esta', 'nuestro', 'nuestra', 'su', 'mi']);
/** Pronombres que el modelo a veces toma por nombres al principio de una frase ("Le diagnosticaron…"). */
const PRONOUNS = new Set(['le', 'les', 'lo', 'se', 'me', 'te', 'nos', 'yo', 'vos', 'tu', 'el', 'ella', 'ellos', 'ellas', 'usted', 'ustedes', 'nosotros', 'quien', 'que']);
/** Roles y sustantivos comunes que el modelo a veces toma por personas ("La empleada", "admin"). */
const ROLE_WORDS = new Set(
  (
    'empleado empleada trabajador trabajadora operario operaria usuario usuaria admin administrador administradora cliente clienta ' +
    'paciente señor señora sr sra jefe jefa gerente encargado encargada responsable titular firmante aclaración aclaracion firma ' +
    'doctor doctora dr dra lic licenciado licenciada ingeniero ingeniera contador contadora abogado abogada proveedor proveedora ' +
    'bearer token root invitado invitada equipo personal'
  ).split(' '),
);
/** Áreas internas y palabras genéricas de organización: "Compras", "Recursos Humanos", "la sucursal". */
const ORG_UNIT_WORDS = new Set(
  (
    'compras ventas finanzas administración administracion contabilidad tesorería tesoreria logística logistica comercial marketing ' +
    'sistemas legales legal rrhh recursos humanos dirección direccion gerencia área area departamento sector sucursal planta depósito ' +
    'deposito oficina equipo tablero directorio comité comite mesa ayuda soporte atención atencion cliente clientes de y e la el ' +
    'los las del general central regional'
  ).split(' '),
);
/** Marcas, plataformas y organismos públicos muy conocidos: no son datos confidenciales de nadie. */
const PUBLIC_ORGS = new Set(
  [
    'google', 'google drive', 'gmail', 'microsoft', 'excel', 'word', 'outlook', 'teams', 'slack', 'whatsapp', 'zoom', 'notion', 'jira',
    'chatgpt', 'openai', 'claude', 'anthropic', 'copilot', 'gemini', 'stripe', 'paypal', 'visa', 'mastercard', 'american express', 'amex',
    'mercado libre', 'mercado pago', 'tienda nube', 'amazon', 'apple', 'meta', 'facebook', 'instagram', 'linkedin', 'afip', 'arca', 'anses',
    'osde', 'swiss medical', 'galeno', 'pami', 'banco nación', 'banco nacion', 'banco central', 'bcra',
  ],
);
/** Calle + número ("Las Heras 1540", "Calle 47 nro 820"); sin número, un nombre de calle suelto no es una dirección. */
const STREET_NUMBER = /\p{L}{2,}\.?\s+(?:n(?:ro|°|º)\.?\s*)?\d{1,5}\b/u;
const NOT_ADDRESS_START = /^(?:legajo|cp|c\.p\.|c[oó]digo|sala|piso|oficina|of\.|lote|expediente|art[ií]culo|ruta)\b/i;

/** Lo que el modelo marcó pero claramente no es un dato personal. */
function implausible(s: Span): boolean {
  const all = words(s.value);
  if (s.type === 'NOMBRE_PERSONA' || s.type === 'RAZON_SOCIAL') {
    if (STREET_START.test(s.value)) return true;
    if (all.every((w) => SOCIETY_WORD.test(w))) return true;
    if (all.every((w) => PLACES.has(w.toLowerCase()) || SOCIETY_WORD.test(w))) return true;
  }
  if (s.type === 'NOMBRE_PERSONA') {
    const rest = all.filter((w, i) => !(i === 0 && DETERMINERS.has(w.toLowerCase())));
    // Solo cargos y áreas ("La empleada", "Jefa de Compras", "admin"): no es el nombre de nadie.
    const roleOrUnit = (w: string) => ROLE_WORDS.has(fold(w).replace(/\.$/, '')) || ORG_UNIT_WORDS.has(fold(w));
    if (rest.length === 0 || rest.every(roleOrUnit)) return true;
    if (rest.every((w) => PRONOUNS.has(fold(w))) || (rest.length === 1 && rest[0]!.length <= 2)) return true;
    // Un nombre tiene al menos una palabra con mayúscula o un nombre de pila conocido ("nahuel ibarra").
    if (!rest.some((w) => /^\p{Lu}/u.test(w) || isFirstName(w))) return true;
  }
  if (s.type === 'RAZON_SOCIAL') {
    const lower = fold(s.value).replace(/[.,]+$/, '');
    if (PUBLIC_ORGS.has(lower)) return true;
    // Solo área + lugar + palabras genéricas ("La sucursal San Juan", "Ventas de Buenos Aires", "ACLARACIÓN").
    const generic = (w: string) => DETERMINERS.has(fold(w)) || ORG_UNIT_WORDS.has(fold(w)) || ROLE_WORDS.has(fold(w)) || PLACES.has(w.toLowerCase());
    if (all.every(generic)) return true;
  }
  if (s.type === 'DIRECCION') {
    if (NOT_ADDRESS_START.test(s.value.trim()) || !STREET_NUMBER.test(s.value)) return true;
  }
  return false;
}

/**
 * Combina lo que encontraron las reglas con lo que encontró el modelo de IA local.
 * - Lo que el modelo encuentra donde no había nada, se suma.
 * - Las reglas con formato verificable (dígito verificador, email…) siempre ganan.
 * - Sobre nombres, empresas, direcciones y datos de salud, el modelo reemplaza a la regla cuando
 *   abarca lo mismo y algo más ("María Laura Gómez" en vez de "María Laura") o cuando está más seguro.
 */
export function combineModelSpans(rules: Span[], model: Span[]): Span[] {
  let accepted = [...rules];
  for (const m of [...model].filter((x) => !implausible(x)).sort((a, b) => RANK[b.confidence] - RANK[a.confidence])) {
    const overlapping = accepted.filter((a) => m.start < a.end && a.start < m.end);
    if (overlapping.length === 0) {
      accepted.push(m);
      continue;
    }
    if (overlapping.some((a) => STRUCTURED.has(a.type))) continue;
    const best = Math.max(...overlapping.map((a) => RANK[a.confidence]));
    const covers = overlapping.every((a) => m.start <= a.start && a.end <= m.end);
    if (RANK[m.confidence] > best || (covers && RANK[m.confidence] >= best)) {
      accepted = accepted.filter((a) => !overlapping.includes(a));
      accepted.push(m);
    }
  }
  return accepted.sort((a, b) => a.start - b.start);
}

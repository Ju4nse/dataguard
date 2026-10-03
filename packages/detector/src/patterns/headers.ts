import type { DetectionType } from '@securedata/shared';
import { normalizeText } from '../util';

/** Palabras en el encabezado que sugieren el tipo de la columna (ya normalizadas). */
// prettier-ignore
const HEADER_HINTS: { type: DetectionType; words: string[] }[] = [
  { type: 'CREDENCIAL', words: ['password', 'contrasena', 'clave', 'pass', 'pwd', 'token', 'api key', 'apikey', 'secret', 'secreto', 'access key'] },
  { type: 'CUIT_CUIL', words: ['cuit', 'cuil'] },
  { type: 'CBU_CVU', words: ['cbu', 'cvu', 'alias', 'alias cbu'] },
  { type: 'IP', words: ['ip', 'direccion ip', 'ip address', 'host'] },
  { type: 'PASAPORTE', words: ['pasaporte', 'passport'] },
  { type: 'SALARIO', words: ['sueldo', 'salario', 'remuneracion', 'haberes', 'honorarios', 'salary', 'aguinaldo'] },
  { type: 'EDAD', words: ['edad', 'age'] },
  {
    type: 'DATO_SENSIBLE',
    words: [
      'diagnostico', 'enfermedad', 'patologia', 'religion', 'afiliacion sindical', 'sindicato', 'gremio', 'orientacion sexual',
      'etnia', 'origen etnico', 'discapacidad', 'licencia medica', 'antecedentes penales', 'grupo sanguineo', 'alergias',
      'medicacion', 'afiliacion politica', 'partido politico',
    ],
  },
  { type: 'EMAIL', words: ['email', 'e mail', 'mail', 'correo', 'correo electronico'] },
  { type: 'TELEFONO', words: ['tel', 'telefono', 'celular', 'cel', 'movil', 'whatsapp', 'phone', 'mobile'] },
  { type: 'DNI', words: ['dni', 'documento', 'nro doc', 'num doc', 'numero de documento', 'doc'] },
  { type: 'TARJETA', words: ['tarjeta', 'nro tarjeta', 'card', 'numero de tarjeta'] },
  { type: 'PATENTE', words: ['patente', 'dominio'] },
  { type: 'FECHA_NACIMIENTO', words: ['fecha de nacimiento', 'fecha nacimiento', 'nacimiento', 'fecha nac', 'f nac', 'fnac', 'birthdate', 'birth date', 'date of birth', 'dob'] },
  { type: 'DIRECCION', words: ['direccion', 'domicilio', 'calle', 'address'] },
  { type: 'RAZON_SOCIAL', words: ['razon social', 'empresa', 'cliente', 'proveedor', 'compania', 'company', 'customer', 'supplier', 'vendor'] },
  {
    type: 'NOMBRE_PERSONA',
    words: [
      'nombre', 'apellido', 'nombre y apellido', 'apellido y nombre', 'titular', 'empleado', 'contacto', 'responsable', 'vendedor', 'paciente', 'alumno',
      'name', 'first name', 'last name', 'full name', 'firstname', 'lastname', 'fullname', 'surname',
    ],
  },
];

/** Si el encabezado habla de una cosa no personal ("nombre del producto"), no es un nombre de persona. */
// prettier-ignore
const NOT_PERSONAL = [
  'producto', 'articulo', 'item', 'sucursal', 'categoria', 'archivo', 'campana', 'plan', 'servicio', 'rubro', 'marca', 'modelo', 'banco', 'ciudad', 'provincia', 'pais', 'localidad',
  'product', 'category', 'file', 'service', 'brand', 'model', 'bank', 'city', 'country', 'state', 'branch',
];

/** Encabezados que indican un identificador interno (ej. "id cliente"), no el dato en sí. */
const ID_WORDS = ['id', 'codigo', 'cod', 'nro cliente', 'numero de cliente', 'code'];

/**
 * Encabezados de identificadores internos o números de negocio: si la columna no tiene otra pista,
 * sus valores no se marcan por "parecerse" a un DNI o un teléfono.
 */
// prettier-ignore
const NEGATIVE_HEADER_WORDS = [
  'codigo', 'cod', 'factura', 'pedido', 'orden', 'remito', 'ticket', 'comprobante', 'monto', 'importe', 'precio', 'total',
  'cantidad', 'id', 'sku', 'legajo', 'nro', 'numero', 'serie', 'lote', 'stock', 'unidades', 'subtotal', 'iva', 'cp',
];

export function isNegativeHeader(rawHeader: string): boolean {
  const h = normalizeText(rawHeader);
  return NEGATIVE_HEADER_WORDS.some((w) => containsWord(h, w));
}

function containsWord(header: string, word: string): boolean {
  return new RegExp(`(^|\\s)${word}(\\s|$)`).test(header);
}

export function headerHint(rawHeader: string): DetectionType | null {
  const h = normalizeText(rawHeader);
  if (!h) return null;
  for (const { type, words } of HEADER_HINTS) {
    if (!words.some((w) => containsWord(h, w))) continue;
    if ((type === 'NOMBRE_PERSONA' || type === 'RAZON_SOCIAL') && NOT_PERSONAL.some((w) => containsWord(h, w))) continue;
    if ((type === 'NOMBRE_PERSONA' || type === 'RAZON_SOCIAL') && ID_WORDS.some((w) => containsWord(h, w))) continue;
    return type;
  }
  return null;
}

/** Tipos de dato sensible que reconoce SecureData AI. */
export const DETECTION_TYPES = [
  'EMAIL',
  'TELEFONO',
  'DNI',
  'CUIT_CUIL',
  'CBU_CVU',
  'TARJETA',
  'PATENTE',
  'NOMBRE_PERSONA',
  'RAZON_SOCIAL',
  'DIRECCION',
  'FECHA_NACIMIENTO',
  'EDAD',
  'PASAPORTE',
  'SALARIO',
  'DATO_SENSIBLE',
  'CREDENCIAL',
  'IP',
] as const;

export type DetectionType = (typeof DETECTION_TYPES)[number];

/** Qué hacer con una columna (o con lo detectado dentro de un texto libre). */
export type Action = 'eliminar' | 'anonimizar' | 'seudonimizar' | 'mantener';

export type Confidence = 'alta' | 'media' | 'baja';

export const DETECTION_LABELS: Record<DetectionType, string> = {
  EMAIL: 'Email',
  TELEFONO: 'Teléfono',
  DNI: 'DNI',
  CUIT_CUIL: 'CUIT / CUIL',
  CBU_CVU: 'CBU / CVU / alias',
  TARJETA: 'Tarjeta de crédito/débito',
  PATENTE: 'Patente',
  NOMBRE_PERSONA: 'Nombre de persona',
  RAZON_SOCIAL: 'Empresa / razón social',
  DIRECCION: 'Dirección',
  FECHA_NACIMIENTO: 'Fecha de nacimiento',
  EDAD: 'Edad',
  PASAPORTE: 'Pasaporte',
  SALARIO: 'Salario / remuneración',
  DATO_SENSIBLE: 'Dato sensible (salud, religión, etc.)',
  CREDENCIAL: 'Contraseña / clave / token',
  IP: 'Dirección IP',
};

/** Nombres cortos para ejes de gráficos (en tablas se usan los completos). */
export const DETECTION_SHORT_LABELS: Record<DetectionType, string> = {
  EMAIL: 'Email',
  TELEFONO: 'Teléfono',
  DNI: 'DNI',
  CUIT_CUIL: 'CUIT / CUIL',
  CBU_CVU: 'CBU / alias',
  TARJETA: 'Tarjeta',
  PATENTE: 'Patente',
  NOMBRE_PERSONA: 'Nombre',
  RAZON_SOCIAL: 'Empresa',
  DIRECCION: 'Dirección',
  FECHA_NACIMIENTO: 'Fecha nac.',
  EDAD: 'Edad',
  PASAPORTE: 'Pasaporte',
  SALARIO: 'Salario',
  DATO_SENSIBLE: 'Dato sensible',
  CREDENCIAL: 'Contraseña / token',
  IP: 'IP',
};

/** Prefijo por defecto de los seudónimos (Persona_01, Empresa_07…). */
export const PSEUDONYM_PREFIXES: Record<DetectionType, string> = {
  EMAIL: 'Email',
  TELEFONO: 'Tel',
  DNI: 'DNI',
  CUIT_CUIL: 'CUIT',
  CBU_CVU: 'CBU',
  TARJETA: 'Tarjeta',
  PATENTE: 'Patente',
  NOMBRE_PERSONA: 'Persona',
  RAZON_SOCIAL: 'Empresa',
  DIRECCION: 'Direccion',
  FECHA_NACIMIENTO: 'Fecha',
  EDAD: 'Edad',
  PASAPORTE: 'Pasaporte',
  SALARIO: 'Salario',
  DATO_SENSIBLE: 'DatoSensible',
  CREDENCIAL: 'Credencial',
  IP: 'IP',
};

export const ACTION_LABELS: Record<Action, string> = {
  eliminar: 'Eliminar columna',
  anonimizar: 'Anonimizar',
  seudonimizar: 'Seudonimizar',
  mantener: 'Mantener',
};

/**
 * Evento de metadatos que se envía al panel. NUNCA lleva contenido,
 * nombres de archivo ni nombres de columnas.
 */
export interface ProcessingEvent {
  source: 'web' | 'extension';
  site: string | null;
  rowCount: number;
  columnCount: number;
  hadSensitive: boolean;
  userAction: 'masked' | 'ignored' | 'cancelled' | null;
  detections: Partial<Record<DetectionType, number>>;
}

import type { DetectionType } from '@securedata/shared';
import { isValidCbu } from '../validators/cbu';
import { isValidCuit } from '../validators/cuit';
import { isValidDni } from '../validators/dni';
import { isValidCard } from '../validators/luhn';
import { onlyDigits } from '../util';
import { isPersonNameValue } from './names';

export const EMAIL_FULL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const PHONE_CHARS = /^\+?[\d\s().-]+$/;
const PATENTE_FULL = /^(?:[A-Z]{3}\s?-?\d{3}|[A-Z]{2}\s?\d{3}\s?[A-Z]{2})$/i;
const PASAPORTE_FULL = /^[A-Z]{3}\d{6}$/i;
const IP_FULL = /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;
const KNOWN_TOKEN =
  /^(?:sk-(?:ant-|proj-|live-|test-)?[A-Za-z0-9_-]{20,}|(?:AKIA|ASIA)[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,}|AIza[0-9A-Za-z_-]{35}|xox[abprs]-[A-Za-z0-9-]{10,}|[sr]k_(?:live|test)_[A-Za-z0-9]{16,}|eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,})$/;
const SOCIETY_SUFFIX = /\b(s\.?\s?a\.?\s?u?\.?|s\.?\s?r\.?\s?l\.?|s\.?\s?a\.?\s?s\.?|s\.?\s?h\.?|s\.?\s?c\.?\s?a\.?|ltda\.?|coop(erativa)?\.?)\s*$/i;
const PERSON_NAME = /^[A-ZÁÉÍÓÚÑ][a-záéíóúñü]+(?:[ ,]+[A-ZÁÉÍÓÚÑ][a-záéíóúñü]+){1,3}$/;

/** Formatos que parecen teléfono pero no lo son: factura "0001-00012345", CUIT "20-12345678-5". */
const NOT_PHONE = [/^\d{4,5}-\d{8}$/, /^\d{2}-\d{8}-\d$/];

/** Teléfono argentino: 10 a 13 dígitos contando 54 / 9 / 0 / 15 opcionales. */
export function isPhone(raw: string): boolean {
  const s = raw.trim();
  if (!PHONE_CHARS.test(s) || NOT_PHONE.some((r) => r.test(s))) return false;
  const d = onlyDigits(s);
  return d.length >= 10 && d.length <= 13;
}

export function isIp(raw: string): boolean {
  return IP_FULL.test(raw.trim());
}

export function isKnownToken(raw: string): boolean {
  return KNOWN_TOKEN.test(raw.trim());
}

/**
 * Comprobaciones de celda completa para los tipos con formato fijo.
 * El orden importa: los tipos con dígito verificador van primero.
 */
export const VALUE_MATCHERS: { type: DetectionType; test: (s: string) => boolean }[] = [
  { type: 'EMAIL', test: (s) => EMAIL_FULL.test(s) },
  { type: 'CREDENCIAL', test: isKnownToken },
  { type: 'CUIT_CUIL', test: isValidCuit },
  { type: 'CBU_CVU', test: isValidCbu },
  { type: 'TARJETA', test: isValidCard },
  { type: 'DNI', test: isValidDni },
  { type: 'TELEFONO', test: isPhone },
  { type: 'IP', test: isIp },
  { type: 'PASAPORTE', test: (s) => PASAPORTE_FULL.test(s.trim()) },
  { type: 'PATENTE', test: (s) => PATENTE_FULL.test(s.trim()) },
];

/** Tipos cuya validación es fuerte (dígito verificador o formato inequívoco). */
export const STRONG_TYPES = new Set<DetectionType>(['EMAIL', 'CUIT_CUIL', 'CBU_CVU', 'TARJETA', 'CREDENCIAL']);

export function looksLikeCompany(s: string): boolean {
  return SOCIETY_SUFFIX.test(s.trim());
}

/** Nombre propio por forma ("Juan Pérez") o por diccionario de nombres de pila (también "PEREZ, JUAN"). */
export function looksLikePersonName(s: string): boolean {
  return PERSON_NAME.test(s.trim()) || isPersonNameValue(s);
}

export { isPersonNameValue };

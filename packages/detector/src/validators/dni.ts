import { onlyDigits } from '../util';

const DNI_FORMAT = /^\d{1,2}\.?\d{3}\.?\d{3}$/;

/** DNI argentino: 7 u 8 dígitos (1.000.000 a 99.999.999), con o sin puntos. */
export function isValidDni(raw: string): boolean {
  const s = raw.trim();
  if (!DNI_FORMAT.test(s)) return false;
  const n = Number(onlyDigits(s));
  return n >= 1_000_000 && n <= 99_999_999;
}

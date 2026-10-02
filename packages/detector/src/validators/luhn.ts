import { onlyDigits } from '../util';

export function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i]);
    if (double) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    double = !double;
  }
  return sum % 10 === 0;
}

/**
 * Prefijos de emisores: Visa 4, Mastercard 51-55 y 2221-2720, Amex 34/37, Diners 36/38/300-305, JCB 35,
 * Maestro/Naranja/Cabal 50 y 56-69. Así un timestamp como "20250315…" no pasa por tarjeta.
 */
const ISSUER = /^(?:4|5[0-9]|222[1-9]|22[3-9]\d|2[3-6]\d\d|27[01]\d|2720|3[4-8]|30[0-5]|6)/;

/** Tarjeta: 13-19 dígitos, emisor conocido y Luhn. */
export function isValidCard(raw: string): boolean {
  const d = onlyDigits(raw);
  if (d.length < 13 || d.length > 19) return false;
  if (!ISSUER.test(d)) return false;
  if (/^(\d)\1+$/.test(d)) return false;
  return luhnValid(d);
}

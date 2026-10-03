import { onlyDigits } from '../util';

/** Prefijos válidos: 20/23/24/27 personas humanas, 30/33/34 personas jurídicas. */
// prettier-ignore
const CUIT_PREFIXES = new Set(['20', '23', '24', '27', '30', '33', '34']);
const WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

/** Dígito verificador (módulo 11) para los primeros 10 dígitos. Devuelve null si no existe (resto 10). */
export function cuitCheckDigit(first10: string): number | null {
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(first10[i]) * WEIGHTS[i]!;
  const r = 11 - (sum % 11);
  if (r === 11) return 0;
  if (r === 10) return null;
  return r;
}

export function isValidCuit(raw: string): boolean {
  const d = onlyDigits(raw);
  if (d.length !== 11) return false;
  if (!CUIT_PREFIXES.has(d.slice(0, 2))) return false;
  return cuitCheckDigit(d.slice(0, 10)) === Number(d[10]);
}

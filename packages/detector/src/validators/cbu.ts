import { onlyDigits } from '../util';

const BLOCK1_WEIGHTS = [7, 1, 3, 9, 7, 1, 3];
const BLOCK2_WEIGHTS = [3, 9, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3];

function checkDigit(digits: string, weights: number[]): number {
  let sum = 0;
  for (let i = 0; i < weights.length; i++) sum += Number(digits[i]) * weights[i]!;
  return (10 - (sum % 10)) % 10;
}

/** Dígitos verificadores de un CBU/CVU: [bloque 1 (banco+sucursal), bloque 2 (cuenta)]. */
export function cbuCheckDigits(bank7: string, account13: string): [number, number] {
  return [checkDigit(bank7, BLOCK1_WEIGHTS), checkDigit(account13, BLOCK2_WEIGHTS)];
}

/** CBU (bancos) y CVU (billeteras, empiezan con 000) comparten formato y verificadores. */
export function isValidCbu(raw: string): boolean {
  const d = onlyDigits(raw);
  if (d.length !== 22) return false;
  if (/^(\d)\1+$/.test(d)) return false;
  const [c1, c2] = cbuCheckDigits(d.slice(0, 7), d.slice(8, 21));
  return c1 === Number(d[7]) && c2 === Number(d[21]);
}

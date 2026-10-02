import type { CellValue } from './types';

export function onlyDigits(s: string): string {
  return s.replace(/\D/g, '');
}

/** Minúsculas, sin tildes, sin puntuación y con espacios simples: "Pérez S.A." → "perez sa". */
export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[.,;:'"()]/g, '')
    .replace(/[_\-/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function cellToString(v: CellValue): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10);
  return String(v).trim();
}

export function isEmpty(v: CellValue): boolean {
  return cellToString(v) === '';
}

/** Ejemplo enmascarado para mostrar en pantalla sin exponer el dato: "20•••••••••6". */
export function maskForDisplay(value: string): string {
  const s = value.trim();
  if (s.length <= 3) return '•'.repeat(s.length);
  if (s.includes('@')) {
    const [user = '', domain = ''] = s.split('@');
    return `${user[0] ?? ''}•••@${domain[0] ?? ''}•••`;
  }
  const keep = s.length > 8 ? 2 : 1;
  return s.slice(0, keep) + '•'.repeat(Math.min(s.length - keep * 2, 10)) + s.slice(-keep);
}

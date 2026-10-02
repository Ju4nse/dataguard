import type { CellValue, Table } from './types';
import type { Segment } from './document';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type PathKey = string | number;

export interface JsonLeaf extends Segment {
  path: PathKey[];
}

const isPlainObject = (v: unknown): v is Record<string, Json> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isPrimitive = (v: unknown) => v === null || ['string', 'number', 'boolean'].includes(typeof v);

/** Un JSON con forma de lista de registros planos ([{...}, {...}]) se trata como tabla. */
export function jsonAsTable(root: unknown): Table | null {
  if (!Array.isArray(root) || root.length === 0) return null;
  if (!root.every((r) => isPlainObject(r) && Object.values(r).every(isPrimitive))) return null;
  const headers = [...new Set(root.flatMap((r) => Object.keys(r as object)))];
  const rows = root.map((r) => headers.map((h) => ((r as Record<string, CellValue>)[h] ?? null) as CellValue));
  return { headers, rows };
}

export function tableToJson(table: Table): Record<string, CellValue>[] {
  return table.rows.map((r) => Object.fromEntries(table.headers.map((h, i) => [h, r[i] ?? null])));
}

/** Recorre el JSON y devuelve un fragmento por cada texto o número, con su clave como pista. */
export function jsonLeaves(root: unknown): JsonLeaf[] {
  const out: JsonLeaf[] = [];
  const walk = (v: unknown, path: PathKey[]) => {
    if (typeof v === 'string' || typeof v === 'number') {
      const keys = path.filter((p): p is string => typeof p === 'string');
      out.push({ text: String(v), hint: keys[keys.length - 1], context: keys[keys.length - 2], path });
    } else if (Array.isArray(v)) {
      v.forEach((item, i) => walk(item, [...path, i]));
    } else if (isPlainObject(v)) {
      for (const [k, item] of Object.entries(v)) walk(item, [...path, k]);
    }
  };
  walk(root, []);
  return out;
}

/** Devuelve una copia del JSON con los valores modificados reemplazados (los demás quedan intactos). */
export function rebuildJson(root: unknown, leaves: JsonLeaf[], texts: string[]): unknown {
  // El JSON entero era un único texto o número.
  if (leaves.length === 1 && leaves[0]!.path.length === 0) return texts[0] === leaves[0]!.text ? root : texts[0];
  const copy = structuredClone(root);
  leaves.forEach((leaf, i) => {
    if (texts[i] === leaf.text) return;
    let node = copy as Record<PathKey, unknown>;
    for (const key of leaf.path.slice(0, -1)) node = node[key] as Record<PathKey, unknown>;
    node[leaf.path[leaf.path.length - 1]!] = texts[i];
  });
  return copy;
}

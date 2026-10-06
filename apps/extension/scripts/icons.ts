/**
 * Genera los íconos de la extensión (public/icons/icon-<tamaño>.png): el escudo de la marca en blanco
 * sobre un cuadrado navy redondeado, igual que el logo de la app. Sin dependencias: dibuja con
 * supermuestreo y escribe el PNG a mano.
 * Uso: npm run icons -w @securedata/extension
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deflateSync } from 'node:zlib';

type Point = [number, number];

const BG: [number, number, number] = [0x0f, 0x17, 0x2a]; // slate-900
const FG: [number, number, number] = [0xff, 0xff, 0xff];

function cubic(p0: Point, p1: Point, p2: Point, p3: Point, steps = 24): Point[] {
  const out: Point[] = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    out.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
  return out;
}

// El mismo trazado que ShieldIcon (viewBox 24×24).
const SHIELD: Point[] = [
  [12, 3],
  [4.5, 6],
  [4.5, 11.5],
  ...cubic([4.5, 11.5], [4.5, 16.1], [7.7, 19.9], [12, 21]),
  ...cubic([12, 21], [16.3, 19.9], [19.5, 16.1], [19.5, 11.5]),
  [19.5, 6],
  [12, 3],
];
const CHECK: Point[] = [
  [9, 12],
  [11, 14],
  [15, 10],
];

function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

const nearLine = (p: Point, line: Point[], half: number) => line.some((a, i) => i > 0 && distToSegment(p, line[i - 1]!, a) <= half);

function insideRoundedSquare(x: number, y: number, size: number, r: number): boolean {
  const cx = Math.min(Math.max(x, r), size - r);
  const cy = Math.min(Math.max(y, r), size - r);
  return Math.hypot(x - cx, y - cy) <= r;
}

function render(size: number): Buffer {
  const SS = 4; // supermuestreo por lado
  const scale = (size * 0.8) / 24; // el ícono de 24 unidades ocupa el 80% del cuadrado
  const half = (size <= 32 ? 2.6 : 2) / 2; // trazo más grueso en tamaños chicos para que se lea
  const radius = size * 0.22;
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let bg = 0;
      let fg = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS;
          const py = y + (sy + 0.5) / SS;
          if (!insideRoundedSquare(px, py, size, radius)) continue;
          bg++;
          const u: Point = [(px - size / 2) / scale + 12, (py - size / 2) / scale + 12];
          if (nearLine(u, SHIELD, half) || nearLine(u, CHECK, half)) fg++;
        }
      }
      const i = (y * size + x) * 4;
      const f = bg ? fg / bg : 0;
      for (let c = 0; c < 3; c++) rgba[i + c] = Math.round(BG[c]! * (1 - f) + FG[c]! * f);
      rgba[i + 3] = Math.round((bg / (SS * SS)) * 255);
    }
  }
  return png(size, rgba);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size: number, rgba: Buffer): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bits por canal
  header[9] = 6; // RGBA
  const rows = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) rgba.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4); // filtro 0 por fila
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const dir = resolve(import.meta.dirname, '../public/icons');
mkdirSync(dir, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  writeFileSync(resolve(dir, `icon-${size}.png`), render(size));
  console.log(`icons/icon-${size}.png`);
}

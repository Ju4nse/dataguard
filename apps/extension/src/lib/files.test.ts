import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PseudonymRegistry } from '@securedata/detector';
import { describe, expect, it } from 'vitest';
import { buildExcel, readFile } from '../offscreen/files';
import { fileDetections, fromBase64, isReviewable, parseTextFile, protectFile, reviewFile, toBase64 } from './files';
import { analyzePrompt, protectPrompt } from './protect';

const FIXTURES = join(import.meta.dirname, '../../../../fixtures');
const fixture = (name: string) => readFileSync(join(FIXTURES, name));

describe('qué archivos se revisan', () => {
  it('planillas, documentos y texto sí; imágenes y comprimidos pasan sin cambios', () => {
    for (const name of ['clientes.csv', 'Datos.XLSX', 'contrato.docx', 'informe.pdf', 'notas.txt', 'pedido.json'])
      expect(isReviewable(new File([], name)), name).toBe(true);
    for (const name of ['foto.png', 'captura.jpg', 'audio.mp3', 'todo.zip', 'sin-extension']) expect(isReviewable(new File([], name)), name).toBe(false);
  });
});

describe('CSV', () => {
  const parsed = parseTextFile('clientes_demo.csv', fixture('clientes_demo.csv'));

  it('detecta las columnas sensibles y arma un CSV protegido, sin los datos originales', () => {
    const registry = new PseudonymRegistry();
    const review = reviewFile('clientes_demo.csv', parsed, {}, registry)!;
    expect(review.summary.map((s) => s.type)).toEqual(expect.arrayContaining(['CUIT_CUIL', 'EMAIL', 'DNI', 'CBU_CVU', 'RAZON_SOCIAL']));
    const out = protectFile(review, registry);
    expect(out.name).toBe('clientes_demo.csv');
    if ('sheets' in out) throw new Error('se esperaba texto');
    const original = fixture('clientes_demo.csv').toString('utf8');
    const cuit = original.match(/\b3[03]-\d{8}-\d\b/)![0];
    expect(original).toContain(cuit);
    expect(out.text).not.toContain(cuit);
    expect(out.text).toMatch(/Empresa_\d+/);
  });

  it('la política de la empresa manda: lo que permite no se cuenta ni se toca', () => {
    const review = reviewFile('clientes_demo.csv', parsed, { EMAIL: 'mantener' }, new PseudonymRegistry())!;
    expect(review.summary.map((s) => s.type)).not.toContain('EMAIL');
    expect(review.enforced).toBe(false); // permitir no obliga a nada
    expect(reviewFile('clientes_demo.csv', parsed, { CUIT_CUIL: 'seudonimizar' }, new PseudonymRegistry())!.enforced).toBe(true);
  });
});

describe('documentos de texto', () => {
  it('usa los mismos seudónimos que los prompts de la pestaña', () => {
    const registry = new PseudonymRegistry();
    protectPrompt(analyzePrompt('Mandale la factura a Graciela Benítez', {}, registry)!, registry);
    const parsed = parseTextFile('nota.txt', new TextEncoder().encode('Reunión con Graciela Benítez (DNI 30.123.456) el martes.'));
    const out = protectFile(reviewFile('nota.txt', parsed, {}, registry)!, registry);
    if ('sheets' in out) throw new Error('se esperaba texto');
    expect(out.text).toContain('Persona_01');
    expect(out.text).not.toContain('Graciela');
    expect(out.text).not.toContain('30.123.456');
  });

  it('un archivo sin datos sensibles no frena nada', () => {
    const parsed = parseTextFile('receta.md', new TextEncoder().encode('# Pan casero\n\nHarina, agua, sal y levadura.'));
    expect(reviewFile('receta.md', parsed, {}, new PseudonymRegistry())).toBeNull();
  });

  it('un archivo que ya pasó por DataGuard no vuelve a cambiar los seudónimos', () => {
    const parsed = parseTextFile('nota.txt', new TextEncoder().encode('Reunión con Persona_01 de Empresa_02.'));
    expect(reviewFile('nota.txt', parsed, {}, new PseudonymRegistry())).toBeNull();
  });

  it('al panel solo van tipos y cantidades; si se subió el original, la acción es "mantener"', () => {
    const parsed = parseTextFile('contrato.txt', fixture('contrato.txt'));
    const review = reviewFile('contrato.txt', parsed, {}, new PseudonymRegistry())!;
    const sent = fileDetections(review, true);
    expect(sent.every((d) => Object.keys(d).sort().join() === 'accion,cantidad,tipo')).toBe(true);
    expect(fileDetections(review, false).every((d) => d.accion === 'mantener')).toBe(true);
  });
});

describe('Excel, Word y PDF (documento oculto de la extensión)', () => {
  it('lee el Excel, lo protege y arma un Excel que se puede volver a leer', async () => {
    const read = await readFile('clientes_demo.xlsx', toBase64(fixture('clientes_demo.xlsx')));
    if (!read.ok) throw new Error(read.error);
    expect(read.archivo.kind).toBe('tabla');
    const registry = new PseudonymRegistry();
    const out = protectFile(reviewFile('clientes_demo.xlsx', read.archivo, {}, registry)!, registry);
    if (!('sheets' in out)) throw new Error('se esperaban hojas');
    const built = await buildExcel(out.sheets);
    if (!built.ok) throw new Error(built.error);
    const again = await readFile(out.name, built.datos);
    if (!again.ok || again.archivo.kind !== 'tabla') throw new Error('no se pudo releer');
    const json = JSON.stringify(again.archivo.sheets);
    expect(json).toMatch(/Empresa_\d+/);
    // También el texto libre ("Observaciones: Mandar factura a …@hotmail.com").
    expect(json).not.toMatch(/[a-z]+\.[a-z]+@(?:gmail|hotmail)\.com/);
    expect(json).toMatch(/"\d{4}-\d{2}-\d{2}"/); // las fechas siguen siendo fechas legibles
  });

  // El PDF se prueba con la extensión compilada: la ruta del worker de pdf.js la resuelve Vite al compilar.
  it('lee Word como texto (la versión protegida se sube como .txt)', async () => {
    for (const name of ['contrato.docx']) {
      const read = await readFile(name, toBase64(fixture(name)));
      if (!read.ok) throw new Error(`${name}: ${read.error}`);
      expect(read.archivo.kind, name).toBe('documento');
      const registry = new PseudonymRegistry();
      const review = reviewFile(name, read.archivo, {}, registry);
      expect(review, name).not.toBeNull();
      expect(protectFile(review!, registry).name).toBe('contrato.txt');
    }
  });

  it('un archivo dañado devuelve un motivo en vez de romper', async () => {
    const read = await readFile('roto.docx', toBase64(new TextEncoder().encode('esto no es un docx')));
    expect(read.ok).toBe(false);
  });

  it('base64 ida y vuelta', () => {
    const bytes = new Uint8Array(100_000).map((_, i) => i % 256);
    expect(fromBase64(toBase64(bytes))).toEqual(bytes);
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import mammoth from 'mammoth';
import { describe, expect, it } from 'vitest';
import { PseudonymRegistry, type Table } from '@securedata/detector';
import { chartFileName } from './chartImage';
import { buildChart, profileColumns, suggestCharts } from './charts';
import { protectTable, tablesFromHtml } from './docTables';

const FIXTURE = join(import.meta.dirname, '../../../../fixtures/informe_ventas.docx');

describe('tablas de un Word', () => {
  it('saca filas y celdas del HTML, con entidades y párrafos dentro de la celda', () => {
    const html =
      '<p>Antes</p><table><tr><td><p>Cliente</p></td><td><p>Monto</p></td></tr>' +
      '<tr><td><p>Ferretería &amp; Hnos.</p><p>Sucursal Centro</p></td><td><p>$ 1.250</p></td></tr></table><p>Después</p>';
    expect(tablesFromHtml(html)).toEqual([
      [
        ['Cliente', 'Monto'],
        ['Ferretería & Hnos. Sucursal Centro', '$ 1.250'],
      ],
    ]);
    expect(tablesFromHtml('<p>Sin tablas</p>')).toEqual([]);
  });

  it('lee la tabla del informe de ventas y se puede graficar', async () => {
    const { value: html } = await mammoth.convertToHtml({ buffer: readFileSync(FIXTURE) });
    const [rows] = tablesFromHtml(html);
    expect(rows![0]).toEqual(['Fecha', 'Vendedor', 'Provincia', 'Producto', 'Monto']);
    expect(rows).toHaveLength(31);
    const table: Table = { headers: rows![0]!, rows: rows!.slice(1) };
    const profiles = profileColumns(table);
    expect(profiles.map((p) => p.kind)).toEqual(['fecha', 'otro', 'categoria', 'categoria', 'numero']);
    const first = buildChart(table, profiles, suggestCharts(profiles)[0]!);
    expect(first.title).toBe('Total de Monto por mes');
    expect(first.points).toHaveLength(6);
  });

  it('la versión protegida usa los seudónimos del documento y deja los números como estaban', async () => {
    const { value: html } = await mammoth.convertToHtml({ buffer: readFileSync(FIXTURE) });
    const [rows] = tablesFromHtml(html);
    const table: Table = { headers: rows![0]!, rows: rows!.slice(1) };
    const registry = new PseudonymRegistry();
    const vendedor = String(table.rows[0]![1]);
    const known = registry.get('Persona', 'NOMBRE_PERSONA', vendedor); // como si ya apareciera en el texto
    const out = protectTable(table, {}, {}, registry);
    expect(out.rows[0]![1]).toBe(known);
    expect(out.rows.every((r) => /^Persona_\d+$/.test(String(r[1])))).toBe(true);
    expect(out.rows.map((r) => r[4])).toEqual(table.rows.map((r) => r[4])); // Monto
    expect(out.rows.map((r) => r[2])).toEqual(table.rows.map((r) => r[2])); // Provincia
  });
});

describe('nombre del archivo de imagen', () => {
  it('sin tildes ni símbolos', () => {
    expect(chartFileName('clientes_demo.xlsx', 'Total de Monto por mes')).toBe('clientes_demo_total-de-monto-por-mes.png');
    expect(chartFileName('informe.docx', 'Promedio de Monto: ene 25 y feb 25')).toBe('informe_promedio-de-monto-ene-25-y-feb-25.png');
  });
});

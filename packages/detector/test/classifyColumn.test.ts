import { describe, expect, it } from 'vitest';
import { analyzeTable, classifyColumn, summarizeFindings, type Table } from '../src';

describe('classifyColumn', () => {
  it('reconoce CUIT por los valores aunque el encabezado no diga nada', () => {
    const f = classifyColumn(0, 'Col A', ['20-12345678-6', '33-69345023-9', '20123456786']);
    expect(f).toMatchObject({ kind: 'columna', type: 'CUIT_CUIL', confidence: 'alta', suggestedAction: 'seudonimizar' });
  });

  it('reconoce emails', () => {
    const f = classifyColumn(0, 'Contacto', ['a@b.com', 'c@d.com.ar', 'e@f.org']);
    expect(f).toMatchObject({ type: 'EMAIL', confidence: 'alta', suggestedAction: 'anonimizar' });
  });

  it('DNI: con encabezado es confianza alta; sin encabezado es baja y por las dudas se seudonimiza', () => {
    const values = ['30.123.456', '25123456', '40.999.111'];
    expect(classifyColumn(0, 'DNI', values)).toMatchObject({ type: 'DNI', confidence: 'alta' });
    expect(classifyColumn(0, 'Col B', values)).toMatchObject({ type: 'DNI', confidence: 'baja', suggestedAction: 'seudonimizar' });
  });

  it('con encabezado de número de negocio ("Importe", "Código") los valores parecidos a DNI no se marcan', () => {
    const values = ['30.123.456', '25123456', '40.999.111'];
    expect(classifyColumn(0, 'Importe', values).kind).toBe('ninguno');
    expect(classifyColumn(0, 'Código', values).kind).toBe('ninguno');
  });

  it('marca la columna aunque los CUIT sean inventados si el encabezado lo dice', () => {
    const f = classifyColumn(0, 'CUIT Cliente', ['20-11111111-1', '20-22222222-1']);
    expect(f).toMatchObject({ type: 'CUIT_CUIL', confidence: 'media' });
  });

  it('distingue empresas de personas en columnas "Cliente"', () => {
    expect(classifyColumn(0, 'Cliente', ['Pérez SA', 'Distribuidora del Sur S.R.L.', 'Lácteos Norte SA'])).toMatchObject({
      type: 'RAZON_SOCIAL',
      confidence: 'alta',
    });
    expect(classifyColumn(0, 'Cliente', ['Juan Pérez', 'María Gómez', 'Lucía Fernández'])).toMatchObject({
      type: 'NOMBRE_PERSONA',
      confidence: 'alta',
    });
  });

  it('no marca "Nombre del producto" como nombre de persona', () => {
    expect(classifyColumn(0, 'Nombre del producto', ['Yerba 1kg', 'Azúcar 1kg']).kind).toBe('ninguno');
  });

  it('"ID cliente" numérico no es una razón social', () => {
    expect(classifyColumn(0, 'ID Cliente', [1001, 1002, 1003]).kind).toBe('ninguno');
  });

  it('detecta datos sensibles dentro de texto libre', () => {
    const f = classifyColumn(0, 'Observaciones', [
      'El cliente pidió que lo llamen al +54 9 11 4567-8901 por la tarde',
      'Reclamo por factura duplicada, sin novedades',
      'Mandar el resumen a contabilidad@pyme.com.ar antes del viernes',
    ]);
    expect(f.kind).toBe('texto');
    expect(f.textCounts).toEqual({ TELEFONO: 1, EMAIL: 1 });
  });

  it('columnas comunes no se marcan', () => {
    expect(classifyColumn(0, 'Monto', [1500.5, 2300, 999]).kind).toBe('ninguno');
    expect(classifyColumn(0, 'Mes', ['Enero', 'Febrero', 'Marzo']).kind).toBe('ninguno');
  });

  it('los ejemplos que se muestran están enmascarados', () => {
    const f = classifyColumn(0, 'CUIT', ['20-12345678-6']);
    expect(f.examples[0]).not.toContain('12345678');
  });
});

describe('analyzeTable + summarizeFindings', () => {
  it('resume detecciones por tipo para el panel', () => {
    const table: Table = {
      headers: ['Cliente', 'CUIT', 'Email', 'Monto'],
      rows: [
        ['Pérez SA', '20-12345678-6', 'a@b.com', 100],
        ['Gómez SRL', '33-69345023-9', 'c@d.com', 200],
      ],
    };
    const summary = summarizeFindings(analyzeTable(table));
    expect(summary).toEqual({ RAZON_SOCIAL: 2, CUIT_CUIL: 2, EMAIL: 2 });
  });
});

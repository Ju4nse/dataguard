import { describe, expect, it } from 'vitest';
import { analyzeDocument, findTerms, jsonAsTable, jsonLeaves, rebuildJson, scanText, transformDocument } from '../src';

describe('razón social en texto libre', () => {
  it('detecta empresas con forma societaria', () => {
    const spans = scanText('Firmamos con Distribuidora del Sur S.R.L. y con Álvarez Hnos SA la semana pasada.');
    expect(spans.map((s) => [s.type, s.value])).toEqual([
      ['RAZON_SOCIAL', 'Distribuidora del Sur S.R.L.'],
      ['RAZON_SOCIAL', 'Álvarez Hnos SA'],
    ]);
  });
  it('no incluye la palabra que empieza la oración', () => {
    expect(scanText('Entre Lácteos Norte SA y nosotros.').map((s) => s.value)).toEqual(['Lácteos Norte SA']);
    expect(scanText('Con Ferretería Central S.A. cerramos.').map((s) => s.value)).toEqual(['Ferretería Central S.A.']);
    expect(scanText('ENTRE ACME SRL Y NOSOTROS').map((s) => s.value)).toEqual(['ACME SRL']);
  });
  it('no cruza saltos de línea (un título no se pega al nombre)', () => {
    const text = 'CONTRATO DE PRESTACIÓN DE SERVICIOS\nEntre Panificadora Belgrano SAS, CUIT';
    expect(scanText(text).map((s) => s.value)).toEqual(['Panificadora Belgrano SAS']);
  });
  it('no marca palabras sueltas en mayúscula sin forma societaria', () => {
    expect(scanText('Reunión en Buenos Aires con el equipo de Ventas')).toEqual([]);
  });
});

describe('direcciones en texto libre', () => {
  it('detecta calles con prefijo y número', () => {
    const values = scanText('Domicilio en Av. Corrientes 1234, CABA. Sucursal: Calle San Martín 455 y Bv. Oroño Nº 1500.').map((s) => s.value);
    expect(values).toEqual(['Av. Corrientes 1234', 'Calle San Martín 455', 'Bv. Oroño Nº 1500']);
  });
  it('no marca montos ni fechas', () => {
    expect(scanText('Pagamos $ 1.250.000 el 15 de marzo de 2025')).toEqual([]);
  });
});

describe('findTerms (términos agregados a mano)', () => {
  it('encuentra sin distinguir mayúsculas ni tildes y devuelve el texto real', () => {
    const text = 'Juan Pérez firmó. Después JUAN PEREZ volvió a llamar.';
    const spans = findTerms(text, [{ value: 'juan perez', type: 'NOMBRE_PERSONA' }]);
    expect(spans.map((s) => s.value)).toEqual(['Juan Pérez', 'JUAN PEREZ']);
  });
  it('solo palabras completas', () => {
    expect(findTerms('Anabella y Ana', [{ value: 'Ana', type: 'NOMBRE_PERSONA' }]).map((s) => s.start)).toEqual([11]);
  });
});

describe('analyzeDocument + transformDocument', () => {
  const contrato =
    'Entre Lácteos Norte SA, CUIT 30-71234567-1, y el Sr. Martín Sosa, DNI 30.456.789, ' +
    'con domicilio en Av. Siempreviva 742. Contacto: msosa@gmail.com. Martín Sosa acepta las condiciones.';

  it('resume por tipo e incluye los términos manuales', () => {
    const { summary } = analyzeDocument([{ text: contrato }], [{ value: 'Martín Sosa', type: 'NOMBRE_PERSONA' }]);
    const byType = Object.fromEntries(summary.map((s) => [s.type, s.count]));
    expect(byType).toMatchObject({ RAZON_SOCIAL: 1, DNI: 1, EMAIL: 1, NOMBRE_PERSONA: 2 });
  });

  it('aplica acciones por tipo, con seudónimos consistentes', () => {
    const segments = [{ text: contrato }];
    const { spans } = analyzeDocument(segments, [{ value: 'Martín Sosa', type: 'NOMBRE_PERSONA' }]);
    const res = transformDocument(segments, spans, {
      NOMBRE_PERSONA: { action: 'seudonimizar' },
      RAZON_SOCIAL: { action: 'seudonimizar', prefix: 'Cliente' },
      CUIT_CUIL: { action: 'seudonimizar' },
      DNI: { action: 'anonimizar' },
      EMAIL: { action: 'anonimizar' },
    });
    const out = res.texts[0]!;
    expect(out).toContain('Entre Cliente_01, CUIT CUIT_01');
    // La segunda empresa que aparece recibe el número siguiente.
    expect(
      transformDocument([{ text: 'A: Uno SA. B: Dos SRL.' }], analyzeDocument([{ text: 'A: Uno SA. B: Dos SRL.' }]).spans, {
        RAZON_SOCIAL: { action: 'seudonimizar' },
      }).texts[0],
    ).toBe('A: Empresa_01. B: Empresa_02.');
    expect(out).toContain('Sr. Persona_01, DNI [DNI]');
    expect(out).toContain('***@gmail.com. Persona_01 acepta');
    expect(out).not.toMatch(/Sosa|30\.456\.789|msosa|Lácteos/);
  });

  it('"mantener" deja el dato como estaba', () => {
    const segments = [{ text: 'Mail: a@b.com' }];
    const { spans } = analyzeDocument(segments);
    expect(transformDocument(segments, spans, { EMAIL: { action: 'mantener' } }).texts[0]).toBe('Mail: a@b.com');
  });
});

describe('JSON', () => {
  it('una lista de registros planos se trata como tabla', () => {
    const t = jsonAsTable([
      { nombre: 'Ana', dni: 30123456 },
      { nombre: 'Luis', email: 'l@x.com' },
    ]);
    expect(t?.headers).toEqual(['nombre', 'dni', 'email']);
    expect(t?.rows[1]).toEqual(['Luis', null, 'l@x.com']);
    expect(jsonAsTable({ a: 1 })).toBeNull();
    expect(jsonAsTable([{ a: { b: 1 } }])).toBeNull();
  });

  const doc = {
    cliente: { nombre: 'Juan Pérez', dni: 30123456, estado: 'Activo', contacto: { email: 'juan@gmail.com' } },
    producto: { nombre: 'Yerba 1kg' },
    notas: ['Llamar al +54 9 11 4567-8901'],
  };

  it('usa la clave como pista, refinada por la clave padre', () => {
    const leaves = jsonLeaves(doc);
    const { spans } = analyzeDocument(leaves);
    const found = leaves.map((l, i) => [l.path.join('.'), spans[i]!.map((s) => s.type).join(',')]);
    expect(found).toEqual([
      ['cliente.nombre', 'NOMBRE_PERSONA'],
      ['cliente.dni', 'DNI'],
      ['cliente.estado', ''],
      ['cliente.contacto.email', 'EMAIL'],
      ['producto.nombre', ''],
      ['notas.0', 'TELEFONO'],
    ]);
  });

  it('reconstruye el JSON con la misma estructura', () => {
    const leaves = jsonLeaves(doc);
    const { spans } = analyzeDocument(leaves);
    const res = transformDocument(leaves, spans, {
      NOMBRE_PERSONA: { action: 'seudonimizar' },
      DNI: { action: 'seudonimizar' },
      EMAIL: { action: 'anonimizar' },
      TELEFONO: { action: 'anonimizar' },
    });
    expect(rebuildJson(doc, leaves, res.texts)).toEqual({
      cliente: { nombre: 'Persona_01', dni: 'DNI_01', estado: 'Activo', contacto: { email: '***@gmail.com' } },
      producto: { nombre: 'Yerba 1kg' },
      notas: ['Llamar al [TEL]'],
    });
    // El original no se modifica.
    expect(doc.cliente.nombre).toBe('Juan Pérez');
  });

  it('un nombre reconocido por su clave también se oculta en el resto del documento', () => {
    const pedido = { contacto: { nombre: 'Martín Sosa' }, notas: ['Entregar a Martín Sosa en mano'] };
    const leaves = jsonLeaves(pedido);
    const { spans } = analyzeDocument(leaves);
    const res = transformDocument(leaves, spans, { NOMBRE_PERSONA: { action: 'seudonimizar' } });
    expect(rebuildJson(pedido, leaves, res.texts)).toEqual({ contacto: { nombre: 'Persona_01' }, notas: ['Entregar a Persona_01 en mano'] });
  });
});

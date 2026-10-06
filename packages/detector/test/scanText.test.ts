import { describe, expect, it } from 'vitest';
import { scanText } from '../src';

const types = (text: string) => scanText(text).map((s) => s.type);

describe('scanText', () => {
  it('encuentra varios tipos en un mismo texto', () => {
    const text =
      'Cliente Juan, DNI 30.123.456, CUIT 20-12345678-6, mail juan.perez@gmail.com, ' +
      'cel +54 9 11 4567-8901, CBU 2850590940090418135201, tarjeta 4111 1111 1111 1111.';
    expect(types(text)).toEqual(['DNI', 'CUIT_CUIL', 'EMAIL', 'TELEFONO', 'CBU_CVU', 'TARJETA']);
  });

  it('devuelve posiciones exactas', () => {
    const text = 'Escribile a ana@empresa.com.ar hoy';
    const [span] = scanText(text);
    expect(span).toBeDefined();
    expect(text.slice(span!.start, span!.end)).toBe('ana@empresa.com.ar');
  });

  it('no confunde montos ni códigos con DNI si no hay contexto', () => {
    expect(types('Facturamos 30123456 pesos en el trimestre')).toEqual([]);
    expect(types('Pedido nro 12345678 despachado')).toEqual([]);
  });

  it('un número con forma de DNI sin la palabra "DNI" se protege igual, con confianza baja', () => {
    const spans = scanText('hola soy juanse (30123456), te escribo por un reclamo');
    expect(spans.find((s) => s.type === 'DNI')).toMatchObject({ value: '30123456', confidence: 'baja' });
    expect(scanText('mi DNI es 30123456')[0]?.confidence).toBe('alta');
    // Montos, cantidades, teléfonos y CUIT inválidos no.
    expect(types('El total fue 15000000')).toEqual([]);
    expect(types('Vendimos 12500000 unidades')).toEqual([]);
    expect(types('llamame al 46751217')).toEqual([]);
    expect(types('el CUIT 20-12345678-5 tiene mal el verificador')).toEqual([]);
  });

  it('detecta sueldos con el signo al final, en dólares o sin moneda pegados a "sueldo"', () => {
    expect(scanText('mi sueldo es: 300000$ por mes').map((s) => s.value)).toEqual(['300000$']);
    expect(scanText('cobra USD 2.500 por mes').map((s) => s.value)).toEqual(['USD 2.500']);
    expect(scanText('sueldo neto 1.250.000').map((s) => s.value)).toEqual(['1.250.000']);
    expect(types('sueldo 2025: aumentos')).toEqual([]);
    expect(types('el sueldo de 1500 empleados')).toEqual([]);
  });

  it('detecta el nombre en una presentación, aunque sea un apodo en minúscula', () => {
    const names = (text: string) =>
      scanText(text)
        .filter((s) => s.type === 'NOMBRE_PERSONA')
        .map((s) => s.value);
    expect(names('hola soy juanse, te escribo por un reclamo')).toEqual(['juanse']);
    expect(names('mi nombre es juan perez')).toEqual(['juan perez']);
    expect(names('Me llamo Ana Gómez y necesito ayuda')).toEqual(['Ana Gómez']);
    expect(names('Hola, soy Juan')).toEqual(['Juan']);
    expect(names('soy contador y trabajo en una pyme')).toEqual([]);
    expect(names('soy analista de datos')).toEqual([]);
  });

  it('no marca un número de 10 dígitos pegado sin contexto como teléfono', () => {
    expect(types('Código de operación 1145678901')).toEqual([]);
    expect(types('Tel: 1145678901')).toEqual(['TELEFONO']);
  });

  it('el CUIT gana sobre el DNI o teléfono que contiene', () => {
    expect(types('DNI/CUIT del titular: 20-12345678-6')).toEqual(['CUIT_CUIL']);
  });

  it('no marca CUIT con verificador incorrecto', () => {
    expect(types('CUIT 20-12345678-5')).not.toContain('CUIT_CUIL');
  });

  it('detecta patentes solo con contexto', () => {
    expect(types('Patente AB 123 CD del vehículo')).toEqual(['PATENTE']);
    expect(types('Producto ABC123 en stock')).toEqual([]);
  });
});

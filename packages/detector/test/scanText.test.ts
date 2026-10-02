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

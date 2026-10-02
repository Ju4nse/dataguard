import { describe, expect, it } from 'vitest';
import { isPhone, isValidCard, isValidCbu, isValidCuit, isValidDni } from '../src';

describe('CUIT/CUIL', () => {
  it('acepta CUIT con dígito verificador correcto, con o sin guiones', () => {
    expect(isValidCuit('20-12345678-6')).toBe(true);
    expect(isValidCuit('20123456786')).toBe(true);
    expect(isValidCuit('33-69345023-9')).toBe(true);
  });
  it('rechaza dígito verificador incorrecto', () => {
    expect(isValidCuit('20-12345678-5')).toBe(false);
  });
  it('rechaza prefijos inexistentes y largos incorrectos', () => {
    expect(isValidCuit('21-12345678-6')).toBe(false);
    expect(isValidCuit('20-1234567-6')).toBe(false);
  });
});

describe('CBU/CVU', () => {
  it('acepta un CBU con ambos verificadores correctos', () => {
    expect(isValidCbu('2850590940090418135201')).toBe(true);
    expect(isValidCbu('28505909 40090418135201')).toBe(true);
  });
  it('rechaza si falla cualquiera de los dos bloques', () => {
    expect(isValidCbu('2850590840090418135201')).toBe(false);
    expect(isValidCbu('2850590940090418135202')).toBe(false);
  });
  it('rechaza 22 dígitos repetidos', () => {
    expect(isValidCbu('0000000000000000000000')).toBe(false);
  });
});

describe('Tarjetas', () => {
  it('acepta números de prueba válidos (Luhn)', () => {
    expect(isValidCard('4111 1111 1111 1111')).toBe(true);
    expect(isValidCard('5500-0000-0000-0004')).toBe(true);
    expect(isValidCard('378282246310005')).toBe(true);
  });
  it('rechaza Luhn inválido o emisor desconocido', () => {
    expect(isValidCard('4111111111111112')).toBe(false);
    expect(isValidCard('9111111111111111')).toBe(false);
  });
});

describe('DNI', () => {
  it('acepta 7-8 dígitos con o sin puntos', () => {
    expect(isValidDni('30.123.456')).toBe(true);
    expect(isValidDni('30123456')).toBe(true);
    expect(isValidDni('5.123.456')).toBe(true);
  });
  it('rechaza montos con decimales y números fuera de rango', () => {
    expect(isValidDni('30.123.456,50')).toBe(false);
    expect(isValidDni('999999')).toBe(false);
    expect(isValidDni('123456789')).toBe(false);
  });
});

describe('Teléfono', () => {
  it('acepta formatos argentinos habituales', () => {
    expect(isPhone('+54 9 11 4567-8901')).toBe(true);
    expect(isPhone('011 15-4567-8901')).toBe(true);
    expect(isPhone('(0351) 456-7890')).toBe(true);
    expect(isPhone('1145678901')).toBe(true);
  });
  it('rechaza números cortos y texto', () => {
    expect(isPhone('4567-8901')).toBe(false);
    expect(isPhone('llamar mañana')).toBe(false);
  });
});

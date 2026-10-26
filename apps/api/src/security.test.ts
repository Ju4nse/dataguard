import { describe, expect, it } from 'vitest';
import { base32, createRateLimiter, isAllowedOrigin } from './security';

describe('límite de intentos', () => {
  it('deja pasar hasta el máximo y frena el resto', () => {
    const allow = createRateLimiter(3, 60_000);
    expect([1, 2, 3, 4].map(() => allow('ana@demo.test'))).toEqual([true, true, true, false]);
    expect(allow('otro@demo.test')).toBe(true);
  });

  it('no crece sin límite: con el tope lleno rechaza claves nuevas', () => {
    const allow = createRateLimiter(5, 60_000, 100);
    for (let i = 0; i < 100; i++) allow(`clave-${i}`);
    expect(allow('clave-nueva')).toBe(false);
    expect(allow('clave-3')).toBe(true); // las que ya estaban siguen contando
  });
});

describe('orígenes permitidos', () => {
  it('acepta la app, la extensión de Chrome y cualquier instalación de la de Firefox', () => {
    expect(isAllowedOrigin('http://localhost:5173')).toBe(true);
    expect(isAllowedOrigin('chrome-extension://kinpmadcicacoodohlbipajehcgmfcim')).toBe(true);
    expect(isAllowedOrigin('moz-extension://11111111-2222-4333-8444-555555555555')).toBe(true);
  });

  it('rechaza sitios web, otras extensiones de Chrome y orígenes de Firefox mal formados', () => {
    expect(isAllowedOrigin('https://malicioso.example')).toBe(false);
    expect(isAllowedOrigin('chrome-extension://otraextensionotraextensionotraex')).toBe(false);
    expect(isAllowedOrigin('moz-extension://no-es-un-uuid')).toBe(false);
    expect(isAllowedOrigin('moz-extension://11111111-2222-4333-8444-555555555555.malicioso.example')).toBe(false);
  });
});

describe('base32', () => {
  it('codifica como RFC 4648 (sin relleno)', () => {
    expect(base32(new TextEncoder().encode('foobar'))).toBe('MZXW6YTBOI');
  });
});

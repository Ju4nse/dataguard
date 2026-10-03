import { describe, expect, it } from 'vitest';
import { base32, createRateLimiter } from './security';

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

describe('base32', () => {
  it('codifica como RFC 4648 (sin relleno)', () => {
    expect(base32(new TextEncoder().encode('foobar'))).toBe('MZXW6YTBOI');
  });
});

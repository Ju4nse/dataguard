import { describe, expect, it } from 'vitest';
import { decryptEquivalences, encryptEquivalences, isEncryptedEquivalences } from './crypto';

const rows = [
  { seudonimo: 'Persona_01', original: 'Graciela Benítez', grupo: 'Persona' },
  { seudonimo: 'Empresa_01', original: 'Ferretería Don Tito', grupo: 'Empresa' },
];

describe('tabla de equivalencias cifrada', () => {
  it('se abre con la contraseña correcta y no deja los datos legibles', async () => {
    const text = await (await encryptEquivalences(rows, 'una clave larga')).text();
    expect(isEncryptedEquivalences(text)).toBe(true);
    expect(text).not.toContain('Benítez');
    expect(await decryptEquivalences(text, 'una clave larga')).toEqual(rows);
  });

  it('rechaza una contraseña incorrecta o un archivo alterado', async () => {
    const text = await (await encryptEquivalences(rows, 'una clave larga')).text();
    await expect(decryptEquivalences(text, 'otra clave')).rejects.toThrow(/contraseña/);
    const tampered = JSON.parse(text);
    tampered.datos = tampered.datos.slice(0, -4) + 'AAAA';
    await expect(decryptEquivalences(JSON.stringify(tampered), 'una clave larga')).rejects.toThrow(/contraseña/);
  });

  it('un CSV común no se confunde con una tabla cifrada', () => {
    expect(isEncryptedEquivalences('seudonimo,valor_original,grupo\nPersona_01,Ana,Persona')).toBe(false);
  });
});

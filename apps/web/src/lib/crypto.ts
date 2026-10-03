import type { EquivalenceRow } from '@securedata/detector';

/**
 * Tabla de equivalencias cifrada con contraseña (AES-GCM de 256 bits, clave derivada con PBKDF2-SHA256).
 * Todo con WebCrypto, en el navegador: la contraseña y los datos no salen de la computadora.
 */
export const ENCRYPTED_FORMAT = 'dataguard-equivalencias-cifradas';
const ITERATIONS = 600_000;

interface EncryptedFile {
  formato: typeof ENCRYPTED_FORMAT;
  version: 1;
  kdf: { nombre: 'PBKDF2'; hash: 'SHA-256'; iteraciones: number; sal: string };
  cifrado: { nombre: 'AES-GCM'; iv: string };
  datos: string;
}

const toB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const fromB64 = (s: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/** Base64 sin desbordar la pila con archivos grandes. */
function bytesToB64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(out);
}

export async function encryptEquivalences(rows: EquivalenceRow[], password: string): Promise<Blob> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, ITERATIONS);
  const plain = new TextEncoder().encode(JSON.stringify(rows));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain));
  const file: EncryptedFile = {
    formato: ENCRYPTED_FORMAT,
    version: 1,
    kdf: { nombre: 'PBKDF2', hash: 'SHA-256', iteraciones: ITERATIONS, sal: toB64(salt) },
    cifrado: { nombre: 'AES-GCM', iv: toB64(iv) },
    datos: bytesToB64(cipher),
  };
  return new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
}

/** ¿El texto es una tabla cifrada de DataGuard? */
export function isEncryptedEquivalences(text: string): boolean {
  try {
    return (JSON.parse(text) as { formato?: string }).formato === ENCRYPTED_FORMAT;
  } catch {
    return false;
  }
}

export async function decryptEquivalences(text: string, password: string): Promise<EquivalenceRow[]> {
  const file = JSON.parse(text) as EncryptedFile;
  const key = await deriveKey(password, fromB64(file.kdf.sal), file.kdf.iteraciones);
  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(file.cifrado.iv) }, key, fromB64(file.datos));
  } catch {
    // AES-GCM verifica la integridad: con otra contraseña (o un archivo alterado) falla acá.
    throw new Error('La contraseña no es correcta (o el archivo está dañado).');
  }
  return JSON.parse(new TextDecoder().decode(plain)) as EquivalenceRow[];
}

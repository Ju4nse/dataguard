/**
 * Modelo guardado en el sistema de archivos privado del navegador (OPFS), que aguanta archivos de
 * cientos de MB (Cache Storage falla con respuestas tan grandes en algunos navegadores). Sin
 * onnxruntime: se puede importar desde la página sin cargar la IA.
 */
export const MODEL_STORE = 'dataguard-modelos-v1';

/** Carpeta del modelo; null si el navegador no tiene OPFS (funciona igual, pero se descarga cada vez). */
export async function modelDir(create = true): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await (await navigator.storage.getDirectory()).getDirectoryHandle(MODEL_STORE, { create });
  } catch {
    return null;
  }
}

/** keys() existe en todos los navegadores con OPFS, pero falta en los tipos de TypeScript. */
export const entryNames = (dir: FileSystemDirectoryHandle) => (dir as unknown as { keys(): AsyncIterable<string> }).keys();

/** ¿Quedó el modelo guardado? (por ejemplo, después de desactivar la IA) */
export async function hasStoredModel(): Promise<boolean> {
  const dir = await modelDir(false);
  if (!dir) return false;
  for await (const _ of entryNames(dir)) return true;
  return false;
}

/** Borra el modelo guardado (libera varios cientos de MB). */
export async function removeStoredModel(): Promise<void> {
  try {
    await (await navigator.storage.getDirectory()).removeEntry(MODEL_STORE, { recursive: true });
  } catch {
    // Ya no estaba.
  }
}

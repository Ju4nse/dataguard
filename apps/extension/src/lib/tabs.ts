/**
 * Pausa por pestaña: el usuario puede apagar DataGuard en una pestaña desde el popup. Se guarda en
 * chrome.storage.session (se borra al cerrar el navegador) para que sobreviva a recargar la página.
 */

/** Del script de contenido al service worker: "¿esta pestaña está pausada?" (la pestaña la deduce de quién manda). */
export interface TabStateRequest {
  tipo: 'pestana-estado';
}

/** Del popup al script de contenido: consultar o cambiar la pausa. Responde TabStatus (sin respuesta: el sitio no está protegido). */
export type TabRequest = { tipo: 'pestana-consultar' } | { tipo: 'pestana-pausar'; pausada: boolean };

export interface TabStatus {
  sitio: string;
  pausada: boolean;
}

const KEY = 'pestanasPausadas';

async function pausedTabs(): Promise<number[]> {
  const stored = await chrome.storage.session.get(KEY);
  return (stored[KEY] as number[] | undefined) ?? [];
}

export async function isTabPaused(tabId: number): Promise<boolean> {
  return (await pausedTabs()).includes(tabId);
}

export async function setTabPaused(tabId: number, paused: boolean): Promise<void> {
  const others = (await pausedTabs()).filter((id) => id !== tabId);
  await chrome.storage.session.set({ [KEY]: paused ? [...others, tabId] : others });
}

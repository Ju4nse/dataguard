import { AI_OFF, type AiStatus } from './ai';
import type { Policy } from './protect';

/** Usuario conectado y política de su empresa. No es secreto: la cookie de sesión la guarda Chrome (httpOnly). */
export interface SessionInfo {
  nombre: string;
  organizacion: string;
  politica: Policy;
}

export interface Settings {
  /** Dirección del servidor de DataGuard (la API), sin "/api" al final. */
  apiBase: string;
  session: SessionInfo | null;
  /** Token tomado de la sesión del panel de DataGuard (ver content/dataguard.ts). Sin él, se usa la cookie. */
  token: string | null;
  /** El usuario activó la IA local. */
  aiEnabled: boolean;
  /** Estado de la IA local (lo actualiza el service worker). */
  aiStatus: AiStatus;
}

/** Panel de DataGuard: de ahí la extensión toma la sesión (content/dataguard.ts). */
export const DATAGUARD_PAGE = 'https://ju4nse.github.io/dataguard/';

/** La API publicada en Supabase (npm run api:deploy). Para desarrollo: http://localhost:8787 en "Servidor". */
export const DEFAULT_API_BASE = 'https://nxqzryeutttqbslvlrjg.supabase.co/functions/v1';

const DEFAULTS: Settings = { apiBase: DEFAULT_API_BASE, session: null, token: null, aiEnabled: false, aiStatus: AI_OFF };

/** Configuración guardada en chrome.storage.local. Nunca se guardan prompts ni seudónimos. */
export async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULTS));
  return { ...DEFAULTS, ...(stored as Partial<Settings>) };
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  await chrome.storage.local.set(patch);
}

export function onSettingsChanged(listener: (s: Settings) => void): void {
  chrome.storage.onChanged.addListener(async (_changes, area) => {
    if (area === 'local') listener(await getSettings());
  });
}

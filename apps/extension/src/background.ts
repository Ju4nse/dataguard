/**
 * Service worker: mantiene la sesión y la política al día y registra los avisos en el panel.
 * Chrome lo apaga cuando no hay actividad, así que no guarda estado en variables: todo va a chrome.storage.
 */
import { DETECTION_TYPES } from '@securedata/shared';
import { refreshSession, sendEvent } from './lib/api';
import type { Detection, Message } from './lib/messages';
import { getSettings } from './lib/storage';

const REFRESH_ALARM = 'refrescar-sesion';
/** Sitios en los que corre el script de contenido (los mismos que el manifest). */
const SITES = new Set(['chatgpt.com', 'chat.openai.com', 'claude.ai']);
const ACTIONS = new Set(['eliminar', 'anonimizar', 'seudonimizar', 'mantener']);
const DECISIONS = new Set(['enmascarado', 'ignorado', 'cancelado']);

async function refreshQuietly() {
  try {
    await refreshSession();
  } catch {
    // Servidor caído: se conserva la política anterior y se reintenta en la próxima alarma.
  }
}

async function setup() {
  await chrome.alarms.create(REFRESH_ALARM, { periodInMinutes: 30 });
  await refreshQuietly();
}

chrome.runtime.onInstalled.addListener(() => void setup());
chrome.runtime.onStartup.addListener(() => void setup());
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === REFRESH_ALARM) void refreshQuietly();
});

/** Se rearma el evento campo por campo: aunque un script de contenido tuviera un bug, al servidor solo llegan metadatos. */
function cleanDetections(list: unknown): Detection[] | null {
  if (!Array.isArray(list) || list.length > 100) return null;
  const out: Detection[] = [];
  for (const d of list as Detection[]) {
    if (!DETECTION_TYPES.includes(d?.tipo) || !ACTIONS.has(d.accion) || !Number.isInteger(d.cantidad) || d.cantidad < 1) return null;
    out.push({ tipo: d.tipo, accion: d.accion, cantidad: d.cantidad });
  }
  return out;
}

async function recordEvent(message: Message, senderUrl: string | undefined) {
  const { session } = await getSettings();
  if (!session || !senderUrl) return; // sin sesión la extensión protege igual, pero no registra nada
  const sitio = new URL(senderUrl).hostname.replace(/^www\./, '');
  const detecciones = cleanDetections(message.detecciones);
  if (!SITES.has(sitio) || !DECISIONS.has(message.decision) || !detecciones?.length) return;
  try {
    await sendEvent(sitio, message.decision, detecciones);
  } catch {
    // Un evento perdido no frena al usuario: la protección ya se aplicó en la página.
  }
}

chrome.runtime.onMessage.addListener((message: Message, sender) => {
  if (sender.id === chrome.runtime.id && message?.tipo === 'evento') void recordEvent(message, sender.url);
});

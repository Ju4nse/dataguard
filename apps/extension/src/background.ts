/**
 * Service worker: mantiene la sesión y la política al día, registra los avisos en el panel y maneja la IA local.
 * Chrome lo apaga cuando no hay actividad, así que no guarda estado en variables: todo va a chrome.storage.
 */
import { DETECTION_TYPES } from '@securedata/shared';
import { ensureOffscreen, handleAiMessage, onIdleAlarm, resumeAi, touch } from './background-ai';
import { siteFor } from './content/sites';
import type { AiRequest, OffscreenEvent } from './lib/ai';
import type { FileRequest, OffscreenFileRequest } from './lib/files';
import { refreshSession, sendEvent } from './lib/api';
import type { Detection, Message } from './lib/messages';
import { getSettings } from './lib/storage';
import { isTabPaused, setTabPaused, type TabStateRequest } from './lib/tabs';

const REFRESH_ALARM = 'refrescar-sesion';
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
  await resumeAi().catch(() => {});
}

chrome.runtime.onInstalled.addListener(() => void setup());
chrome.runtime.onStartup.addListener(() => void setup());
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === REFRESH_ALARM) void refreshQuietly();
  else void onIdleAlarm(alarm.name);
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

/** Del archivo solo viajan el tipo de entrada, la extensión y la cantidad de filas (null: dato inválido). */
function cleanFile(a: Message['archivo']): Message['archivo'] | null {
  if (a === undefined) return undefined;
  if ((a.entrada !== 'tabla' && a.entrada !== 'documento') || !/^[a-z0-9]{1,8}$/.test(a.formato)) return null;
  if (a.filas !== undefined && (!Number.isInteger(a.filas) || a.filas < 0)) return null;
  return { entrada: a.entrada, formato: a.formato, filas: a.filas };
}

/** Archivos adjuntos: el documento oculto lee Excel, Word y PDF, y arma el Excel protegido. Los bytes no salen de la extensión. */
async function handleFile(message: FileRequest): Promise<unknown> {
  await ensureOffscreen();
  await touch();
  const req: OffscreenFileRequest =
    message.tipo === 'archivo-leer'
      ? { destino: 'archivo', tipo: 'leer', nombre: message.nombre, datos: message.datos }
      : { destino: 'archivo', tipo: 'excel', hojas: message.hojas };
  return (await chrome.runtime.sendMessage(req)) ?? { ok: false, error: 'el lector de archivos no respondió' };
}

async function recordEvent(message: Message, senderUrl: string | undefined) {
  const { session } = await getSettings();
  if (!session || !senderUrl) return; // sin sesión la extensión protege igual, pero no registra nada
  const sitio = new URL(senderUrl).hostname.replace(/^www\./, '');
  const detecciones = cleanDetections(message.detecciones);
  if (!siteFor(sitio) || !DECISIONS.has(message.decision) || !detecciones?.length) return;
  const archivo = cleanFile(message.archivo);
  if (archivo === null) return;
  try {
    await sendEvent(sitio, message.decision, detecciones, archivo);
  } catch {
    // Un evento perdido no frena al usuario: la protección ya se aplicó en la página.
  }
}

// Una pestaña cerrada ya no está pausada (los números de pestaña se reutilizan).
chrome.tabs.onRemoved.addListener((tabId) => void setTabPaused(tabId, false));

chrome.runtime.onMessage.addListener((message: Message | AiRequest | OffscreenEvent | FileRequest | TabStateRequest, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return;
  if (message?.tipo === 'evento') void recordEvent(message, sender.url);
  else if (message?.tipo === 'pestana-estado') {
    // Los scripts de contenido no pueden leer chrome.storage.session: se lo responde el service worker.
    const tabId = sender.tab?.id;
    if (tabId === undefined) return;
    isTabPaused(tabId).then(sendResponse, () => sendResponse(false));
    return true;
  }
  else if (message?.tipo === 'archivo-leer' || message?.tipo === 'archivo-excel') {
    // Solo desde los scripts de contenido (las pestañas), no desde el propio documento oculto.
    if (!sender.tab) return;
    handleFile(message).then(sendResponse, (e: unknown) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }));
    return true;
  } else if (typeof message?.tipo === 'string' && message.tipo.startsWith('ia-')) return handleAiMessage(message as AiRequest | OffscreenEvent, sendResponse);
});

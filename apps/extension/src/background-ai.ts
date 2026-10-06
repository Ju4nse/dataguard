/**
 * IA local, del lado del service worker: el service worker no puede correr el modelo (no tiene DOM ni
 * workers), así que lo maneja un documento oculto. Acá se crea ese documento cuando hace falta, se
 * cierra si nadie lo usa (el modelo ocupa más de 1 GB de memoria) y se guarda el estado para el popup.
 */
import { AI_OFF, type AiDetectResponse, type AiRequest, type AiStatus, type OffscreenEvent, type OffscreenRequest } from './lib/ai';
import { getSettings, saveSettings } from './lib/storage';

const OFFSCREEN_URL = 'offscreen.html';
const IDLE_ALARM = 'ia-inactiva';
/** Sin análisis durante este tiempo se libera la memoria; el modelo queda guardado y vuelve a cargarse en segundos. */
const IDLE_MINUTES = 10;
/** Un prompt más largo que esto se revisa solo con las reglas (la IA tardaría demasiado). */
const MAX_CHARS = 20_000;

let creating: Promise<void> | null = null;

async function hasOffscreen(): Promise<boolean> {
  const contexts = await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT] });
  return contexts.length > 0;
}

async function ensureOffscreen(): Promise<void> {
  if (await hasOffscreen()) return;
  creating ??= chrome.offscreen
    .createDocument({
      url: OFFSCREEN_URL,
      reasons: [chrome.offscreen.Reason.WORKERS],
      justification: 'Corre el modelo de IA local que detecta datos personales en los prompts.',
    })
    .finally(() => (creating = null));
  await creating;
}

async function closeOffscreen() {
  if (await hasOffscreen()) await chrome.offscreen.closeDocument();
}

const toOffscreen = (req: OffscreenRequest) => chrome.runtime.sendMessage(req);
const touch = () => chrome.alarms.create(IDLE_ALARM, { delayInMinutes: IDLE_MINUTES });

async function setStatus(status: AiStatus) {
  await saveSettings({ aiStatus: status });
}

async function activate() {
  await saveSettings({ aiEnabled: true, aiStatus: { estado: 'descargando', avance: 0, error: null } });
  await ensureOffscreen();
  await toOffscreen({ destino: 'ia', tipo: 'cargar' });
  await touch();
}

async function deactivate() {
  await saveSettings({ aiEnabled: false, aiStatus: AI_OFF });
  await chrome.alarms.clear(IDLE_ALARM);
  await closeOffscreen();
}

async function detect(texto: unknown): Promise<AiDetectResponse> {
  const { aiEnabled, aiStatus } = await getSettings();
  if (!aiEnabled || aiStatus.estado !== 'lista' || typeof texto !== 'string' || texto.length > MAX_CHARS) return { spans: null };
  await ensureOffscreen();
  await touch();
  const res = (await toOffscreen({ destino: 'ia', tipo: 'detectar', texto })) as AiDetectResponse | undefined;
  return res ?? { spans: null };
}

/** Al abrir Chrome: si la descarga había quedado a medias, se retoma. Si ya estaba lista, se carga cuando haga falta. */
export async function resumeAi() {
  const { aiEnabled, aiStatus } = await getSettings();
  if (aiEnabled && aiStatus.estado !== 'lista') await activate();
}

/** Mensajes de la IA. Devuelve true si la respuesta es asíncrona (como pide chrome.runtime.onMessage). */
export function handleAiMessage(message: AiRequest | OffscreenEvent, sendResponse: (r: unknown) => void): boolean {
  const run = async () => {
    switch (message.tipo) {
      case 'ia-activar':
        return activate();
      case 'ia-desactivar':
        return deactivate();
      case 'ia-preparar': {
        const { aiEnabled, aiStatus } = await getSettings();
        if (!aiEnabled || aiStatus.estado !== 'lista') return;
        await ensureOffscreen();
        await toOffscreen({ destino: 'ia', tipo: 'cargar' });
        return touch();
      }
      case 'ia-detectar':
        return sendResponse(await detect(message.texto));
      case 'ia-estado': {
        const { aiEnabled, aiStatus } = await getSettings();
        if (!aiEnabled) return;
        // Cargar desde el disco también avisa "descargando": si ya estaba lista, no se muestra.
        if (message.estado === 'descargando' && aiStatus.estado === 'lista') return;
        return setStatus({ estado: message.estado, avance: message.estado === 'lista' ? 1 : (message.avance ?? 0), error: message.error ?? null });
      }
    }
  };
  run().catch((err: unknown) => {
    if (message.tipo === 'ia-detectar') sendResponse({ spans: null } satisfies AiDetectResponse);
    else if (message.tipo === 'ia-activar') void setStatus({ estado: 'error', avance: 0, error: err instanceof Error ? err.message : String(err) });
  });
  return message.tipo === 'ia-detectar';
}

export async function onIdleAlarm(name: string) {
  if (name === IDLE_ALARM) await closeOffscreen();
}

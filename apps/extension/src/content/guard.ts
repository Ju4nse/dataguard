/**
 * Revisa el prompt al enviarlo y, si tiene datos sensibles, frena el envío y ofrece reemplazarlos por
 * seudónimos. Todo pasa en la computadora: al panel solo le llegan tipos y cantidades, y con la IA
 * local activa el texto va al modelo dentro de la extensión, nunca a la red.
 */
import { PseudonymRegistry } from '@securedata/detector';
import type { Decision, Message } from '../lib/messages';
import { analyzePrompt, protectPrompt, toDetections, type PromptAnalysis } from '../lib/protect';
import { getSettings, onSettingsChanged, type Settings } from '../lib/storage';
import { createAiClient } from './ai';
import { readText, writeText } from './editor';
import { composerFrom, findComposer, findSendButton, isSendButton, type Composer, type Site } from './sites';
import { askUser, mountIndicator, setAiActive, setChecking, setPendingCount, showCopyFallback, type Choice } from './ui';

/** Al enviar, cuánto se espera a la IA local como mucho (la primera vez carga el modelo del disco); después, solo reglas. */
const AI_SEND_TIMEOUT_MS = 12_000;

/** Activa la protección en la página. */
export async function guard(site: Site) {
  let settings: Settings = await getSettings();
  const ai = createAiClient(() => settings.aiEnabled && settings.aiStatus.estado === 'lista');
  onSettingsChanged((s) => {
    settings = s;
    setAiActive(ai.active());
  });
  // Seudónimos de la pestaña: solo en memoria, se pierden al cerrarla. "Persona_01" es la misma en toda la conversación.
  let registry = new PseudonymRegistry();
  /** Mientras el aviso está abierto o se envía lo ya revisado, no se vuelve a interceptar. */
  let busy = false;

  const policy = () => settings.session?.politica ?? {};
  const report = async (a: PromptAnalysis, decision: Decision) => {
    const message: Message = { tipo: 'evento', decision, detecciones: toDetections(a, decision) };
    try {
      await chrome.runtime.sendMessage(message);
    } catch {
      // Extensión recargada o actualizada: se pierde el evento, no la protección.
    }
  };

  mountIndicator({ rows: () => registry.entries(), forget: () => (registry = new PseudonymRegistry()) });
  setAiActive(ai.active());

  /**
   * Envía lo que hay en el cuadro con el botón del sitio. Lo ya protegido pasa otra vez por la revisión
   * (si el reemplazo no llegó al editor, se frena de nuevo en vez de mandar el original); solo lo que el
   * usuario decidió enviar sin proteger la saltea.
   */
  async function send(composer: Composer, skipReview: boolean) {
    // El botón puede tardar un instante en habilitarse después de cambiar el texto.
    for (let i = 0; i < 20; i++) {
      const button = findSendButton(site, composer);
      if (button && !button.disabled) {
        busy = skipReview;
        try {
          button.click();
        } finally {
          busy = false;
        }
        return;
      }
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  async function review(composer: Composer, a: PromptAnalysis) {
    const protectedText = protectPrompt(a, registry);
    let choice: Choice;
    busy = true;
    try {
      choice = await askUser({
        site: site.name,
        analysis: a,
        protectedText,
        pseudonyms: registry.entries().map((r) => r.seudonimo),
        organizacion: settings.session?.organizacion ?? null,
      });
    } finally {
      busy = false;
    }
    setPendingCount(0);

    if (choice === 'cancelar') {
      void report(a, 'cancelado');
      composer.focus();
      return;
    }
    if (choice === 'sin-proteger') {
      void report(a, 'ignorado');
      await send(composer, true);
      return;
    }
    if (!(await writeText(composer, protectedText))) {
      void report(a, 'cancelado');
      await showCopyFallback(protectedText);
      return;
    }
    void report(a, 'enmascarado');
    if (choice === 'proteger-enviar') await send(composer, false);
  }

  /**
   * La IA local todavía no revisó este texto: se frena el envío, se espera su resultado (o el tiempo
   * máximo) y se sigue como siempre. Si no encontró nada, se envía sin mostrar nada.
   */
  async function reviewWithAi(composer: Composer, text: string) {
    busy = true;
    setChecking();
    let spans;
    try {
      spans = await ai.request(text, AI_SEND_TIMEOUT_MS);
    } finally {
      busy = false;
    }
    if (!spans) ai.skip(text); // sin respuesta: este texto queda revisado solo con las reglas
    // Si el usuario siguió escribiendo mientras tanto, no se envía: lo hará de nuevo cuando termine.
    if (readText(composer) !== text) {
      setPendingCount(0);
      return;
    }
    const a = analyzePrompt(text, policy(), registry, spans ?? []);
    setPendingCount(0);
    if (a) await review(composer, a);
    else await send(composer, false);
  }

  /** Revisa el cuadro: si hay algo que proteger (o falta que lo revise la IA), frena el envío y devuelve true. */
  function intercept(composer: Composer): boolean {
    const text = readText(composer);
    if (!text.trim()) return false;
    if (ai.active() && !ai.has(text)) {
      void reviewWithAi(composer, text);
      return true;
    }
    const a = analyzePrompt(text, policy(), registry, ai.get(text));
    if (!a) return false;
    void review(composer, a);
    return true;
  }

  const block = (e: Event) => {
    e.preventDefault();
    e.stopImmediatePropagation();
  };

  // Fase de captura en window: se ejecuta antes que los manejadores del sitio.
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
      const composer = composerFrom(site, e.target);
      if (!composer) return;
      if (busy || intercept(composer)) block(e);
    },
    true,
  );

  window.addEventListener(
    'click',
    (e) => {
      const button = e.target instanceof Element ? e.target.closest('button') : null;
      if (!button || busy) return;
      const composer = findComposer(site);
      if (composer && isSendButton(site, button, composer) && intercept(composer)) block(e);
    },
    true,
  );

  window.addEventListener(
    'submit',
    (e) => {
      if (busy || !(e.target instanceof HTMLFormElement)) return;
      const composer = findComposer(site);
      if (composer && e.target.contains(composer) && intercept(composer)) block(e);
    },
    true,
  );

  // Aviso mientras se escribe (sin modificar nada). Con la IA local, el texto ya se va analizando.
  const countIn = (text: string) => analyzePrompt(text, policy(), registry, ai.get(text))?.summary.reduce((n, s) => n + s.count, 0) ?? 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  document.addEventListener(
    'input',
    (e) => {
      const composer = composerFrom(site, e.target);
      if (!composer) return;
      ai.prepare();
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const text = readText(composer);
        if (!busy) setPendingCount(countIn(text)); // si ya se está enviando, el indicador muestra eso
        if (!ai.active() || !text.trim() || ai.has(text)) return;
        await ai.request(text, AI_SEND_TIMEOUT_MS);
        if (!busy && readText(composer) === text) setPendingCount(countIn(text));
      }, 500);
    },
    true,
  );
}

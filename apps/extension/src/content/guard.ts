/**
 * Revisa el prompt al enviarlo y, si tiene datos sensibles, frena el envío y ofrece reemplazarlos por
 * seudónimos. Todo pasa en la página: el texto nunca sale de la computadora y al service worker solo
 * le llegan tipos y cantidades.
 */
import { PseudonymRegistry } from '@securedata/detector';
import type { Decision, Message } from '../lib/messages';
import { analyzePrompt, protectPrompt, toDetections, type PromptAnalysis } from '../lib/protect';
import { getSettings, onSettingsChanged, type Settings } from '../lib/storage';
import { readText, writeText } from './editor';
import { composerFrom, findComposer, findSendButton, isSendButton, type Composer, type Site } from './sites';
import { askUser, mountIndicator, setPendingCount, showCopyFallback, type Choice } from './ui';

/** Activa la protección en la página. */
export async function guard(site: Site) {
  let settings: Settings = await getSettings();
  onSettingsChanged((s) => (settings = s));
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

  /** Revisa el cuadro: si hay algo que proteger, abre el aviso y devuelve true (hay que frenar el envío). */
  function intercept(composer: Composer): boolean {
    const a = analyzePrompt(readText(composer), policy(), registry);
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

  // Aviso mientras se escribe (sin modificar nada).
  let timer: ReturnType<typeof setTimeout> | undefined;
  document.addEventListener(
    'input',
    (e) => {
      const composer = composerFrom(site, e.target);
      if (!composer) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        const a = analyzePrompt(readText(composer), policy(), registry);
        setPendingCount(a ? a.summary.reduce((n, s) => n + s.count, 0) : 0);
      }, 400);
    },
    true,
  );
}

/**
 * Dónde está el cuadro del prompt y el botón de enviar en cada sitio. Los sitios cambian su HTML seguido:
 * cada lista va de lo más específico a lo más genérico, y si algo deja de andar se arregla acá.
 */
export interface Site {
  name: string;
  hosts: string[];
  composer: string[];
  sendButton: string[];
}

const GENERIC_SEND = ['button[aria-label*="Send" i]', 'button[aria-label*="Enviar" i]'];

export const SITES: Site[] = [
  {
    name: 'ChatGPT',
    hosts: ['chatgpt.com', 'chat.openai.com'],
    composer: ['#prompt-textarea', 'div.ProseMirror[contenteditable="true"]', 'form textarea'],
    sendButton: ['[data-testid="send-button"]', '#composer-submit-button', ...GENERIC_SEND],
  },
  {
    name: 'Claude',
    hosts: ['claude.ai'],
    composer: ['div.ProseMirror[contenteditable="true"]', '[contenteditable="true"][role="textbox"]', 'fieldset textarea'],
    sendButton: ['button[aria-label="Send message"]', 'button[aria-label="Enviar mensaje"]', ...GENERIC_SEND],
  },
];

export function siteFor(hostname: string): Site | null {
  const host = hostname.replace(/^www\./, '');
  return SITES.find((s) => s.hosts.includes(host)) ?? null;
}

export type Composer = HTMLElement;

/** El cuadro del prompt que contiene a `node`, si lo hay. */
export function composerFrom(site: Site, node: EventTarget | null): Composer | null {
  if (!(node instanceof Element)) return null;
  for (const sel of site.composer) {
    const el = node.closest<HTMLElement>(sel);
    if (el) return el;
  }
  return null;
}

/** El cuadro del prompt visible en la página. */
export function findComposer(site: Site): Composer | null {
  for (const sel of site.composer) {
    for (const el of document.querySelectorAll<HTMLElement>(sel)) if (el.offsetParent !== null) return el;
  }
  return null;
}

/** Contenedor del cuadro (el formulario o el bloque que también tiene el botón de enviar). */
function composerBox(composer: Composer): Element {
  return composer.closest('form, fieldset') ?? composer.parentElement?.parentElement?.parentElement ?? document.body;
}

/** ¿Es el botón de enviar de este cuadro? Los selectores genéricos solo valen dentro del cuadro. */
export function isSendButton(site: Site, button: Element, composer: Composer): boolean {
  if (!site.sendButton.some((sel) => button.matches(sel))) return false;
  return composerBox(composer).contains(button) || button.matches(site.sendButton[0]!);
}

export function findSendButton(site: Site, composer: Composer): HTMLButtonElement | null {
  const box = composerBox(composer);
  for (const sel of site.sendButton) {
    const el = box.querySelector<HTMLButtonElement>(sel);
    if (el) return el;
  }
  return document.querySelector<HTMLButtonElement>(site.sendButton[0]!);
}

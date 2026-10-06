/**
 * Dónde está el cuadro del prompt y el botón de enviar en cada sitio. Los sitios cambian su HTML seguido:
 * cada lista va de lo más específico a lo más genérico, y si algo deja de andar se arregla acá.
 * Para sumar un sitio: agregarlo acá y en "matches" de public/manifest.json (un test verifica que coincidan).
 */
export interface Site {
  name: string;
  hosts: string[];
  composer: string[];
  /** Puede no ser un <button>: algunos sitios usan un div con role="button". */
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
  {
    // Editor Quill. El botón de enviar aparece recién cuando hay texto.
    name: 'Gemini',
    hosts: ['gemini.google.com'],
    composer: ['div.ql-editor[contenteditable="true"]', 'rich-textarea [contenteditable="true"]'],
    sendButton: ['button[aria-label="Enviar mensaje"]', 'button[aria-label="Send message"]', 'button.send-button', ...GENERIC_SEND],
  },
  {
    // Editor Lexical, sin <form>.
    name: 'Perplexity',
    hosts: ['perplexity.ai'],
    composer: ['#ask-input', 'div[contenteditable="true"][role="textbox"]', 'textarea'],
    sendButton: ['button[aria-label="Enviar"]', 'button[aria-label="Submit"]', '[data-testid="submit-button"]', ...GENERIC_SEND],
  },
  {
    name: 'DeepSeek',
    hosts: ['chat.deepseek.com'],
    composer: ['textarea#chat-input', 'textarea'],
    sendButton: ['div[role="button"][aria-disabled]', 'button[type="submit"]', ...GENERIC_SEND],
  },
  {
    name: 'Copilot',
    hosts: ['copilot.microsoft.com', 'copilot.com'],
    composer: ['textarea#userInput', 'textarea'],
    sendButton: ['button[data-testid="submit-button"]', 'button[aria-label="Submit message"]', 'button[aria-label="Enviar mensaje"]', ...GENERIC_SEND],
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

/** El elemento clickeable (botón o div con role="button") donde cayó un clic. */
export function clickableFrom(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element ? target.closest<HTMLElement>('button, [role="button"]') : null;
}

/**
 * Contenedor del cuadro: el ancestro más cercano que también tiene el botón de enviar (no todos los
 * sitios usan un <form>). Si no aparece, el formulario o fieldset que lo contiene.
 */
function composerBox(site: Site, composer: Composer): Element {
  const selector = site.sendButton.join(', ');
  let el: Element | null = composer.parentElement;
  for (let i = 0; i < 10 && el && el !== document.body; i++, el = el.parentElement) {
    if (el.querySelector(selector)) return el;
  }
  return composer.closest('form, fieldset') ?? document.body;
}

/** ¿Es el botón de enviar de este cuadro? Los selectores genéricos solo valen dentro del cuadro. */
export function isSendButton(site: Site, button: Element, composer: Composer): boolean {
  if (!site.sendButton.some((sel) => button.matches(sel))) return false;
  return composerBox(site, composer).contains(button) || button.matches(site.sendButton[0]!);
}

export function findSendButton(site: Site, composer: Composer): HTMLElement | null {
  const box = composerBox(site, composer);
  for (const sel of site.sendButton) {
    const el = box.querySelector<HTMLElement>(sel);
    if (el) return el;
  }
  return document.querySelector<HTMLElement>(site.sendButton[0]!);
}

/** El sitio todavía no habilitó el botón (por ejemplo, mientras procesa el texto nuevo). */
export const isDisabled = (button: HTMLElement) => (button as HTMLButtonElement).disabled === true || button.getAttribute('aria-disabled') === 'true';

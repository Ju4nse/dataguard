import type { Composer } from './sites';

const BLOCKS = new Set(['P', 'DIV', 'PRE', 'BLOCKQUOTE', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);

/** Texto del cuadro, un renglón por párrafo (innerText dejaría líneas en blanco de más entre párrafos). */
export function readText(composer: Composer): string {
  if (composer instanceof HTMLTextAreaElement) return composer.value;
  const blocks = [...composer.children].filter((c) => BLOCKS.has(c.tagName));
  if (blocks.length === 0) return composer.innerText;
  return blocks.map((b) => (b as HTMLElement).innerText.replace(/\n$/, '')).join('\n');
}

const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Espera a que el editor del sitio procese el cambio: ProseMirror pasa el DOM a su estado en una tarea aparte. */
const settle = () => new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 30)));

/** ¿El cuadro muestra exactamente `text`? Se mira después de que el editor procesó el cambio (puede deshacerlo). */
async function shows(composer: Composer, text: string): Promise<boolean> {
  await settle();
  return normalize(readText(composer)) === normalize(text);
}

/**
 * Reemplaza el texto del cuadro como si el usuario lo hubiera escrito, para que el editor del sitio
 * (ProseMirror en ChatGPT y Claude) actualice su estado. Devuelve false si no lo pudo reemplazar.
 */
export async function writeText(composer: Composer, text: string): Promise<boolean> {
  composer.focus();
  if (composer instanceof HTMLTextAreaElement) {
    // El setter nativo: React ignora los cambios hechos con `value =` directamente.
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(composer, text);
    composer.dispatchEvent(new Event('input', { bubbles: true }));
    return shows(composer, text);
  }

  const range = document.createRange();
  range.selectNodeContents(composer);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);

  if (text.includes('\n')) {
    // Varios renglones: como pegado, así el editor arma un párrafo por renglón.
    const data = new DataTransfer();
    data.setData('text/plain', text);
    composer.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  } else {
    document.execCommand('insertText', false, text);
  }
  if (await shows(composer, text)) return true;

  // Último intento: insertar como texto escrito.
  selection.removeAllRanges();
  range.selectNodeContents(composer);
  selection.addRange(range);
  document.execCommand('insertText', false, text);
  return shows(composer, text);
}

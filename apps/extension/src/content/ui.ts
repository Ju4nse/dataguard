import type { EquivalenceRow } from '@securedata/detector';
import { DETECTION_LABELS } from '@securedata/shared';
import type { PromptAnalysis } from '../lib/protect';
import { STYLES } from './styles';

/**
 * Interfaz dentro de la página (aviso, indicador y seudónimos), en un shadow DOM: los estilos del sitio no
 * la afectan y los nuestros no tocan el sitio. Todo texto va con textContent, nunca como HTML.
 */
type Child = Node | string | null | false;

function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, string> = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) el.setAttribute(k, v);
  for (const c of children) if (c) el.append(c);
  return el;
}

const SHIELD =
  '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6L12 3Z"/><path d="m9 12 2 2 4-4"/></svg>';

function shield(): HTMLSpanElement {
  const s = h('span', { class: 'shield' });
  s.innerHTML = SHIELD; // constante propia, sin datos del usuario
  return s;
}

let root: ShadowRoot | null = null;

function shadow(): ShadowRoot {
  if (root) return root;
  const host = document.createElement('dataguard-ext');
  // Las teclas dentro del aviso (Enter, Esc) no llegan a los atajos del sitio.
  for (const type of ['keydown', 'keyup', 'keypress']) host.addEventListener(type, (e) => e.stopPropagation());
  document.documentElement.append(host);
  root = host.attachShadow({ mode: 'closed' });
  root.append(h('style', {}, STYLES));
  return root;
}

// ---------- Aviso antes de enviar ----------

export type Choice = 'proteger-enviar' | 'proteger' | 'sin-proteger' | 'cancelar';

export interface AskOptions {
  site: string;
  analysis: PromptAnalysis;
  protectedText: string;
  /** Seudónimos de la pestaña, para resaltarlos en la vista previa. */
  pseudonyms: string[];
  organizacion: string | null;
}

/** Texto con los seudónimos resaltados (como nodos, sin HTML). */
function highlighted(text: string, pseudonyms: string[]): Node[] {
  if (pseudonyms.length === 0) return [document.createTextNode(text)];
  const escaped = [...pseudonyms].sort((a, b) => b.length - a.length).map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`(${escaped.join('|')})`, 'g');
  return text.split(re).map((part, i) => (i % 2 ? h('mark', {}, part) : document.createTextNode(part)));
}

/** Muestra el aviso y espera la decisión. Esc o clic afuera equivalen a cancelar. */
export function askUser(o: AskOptions): Promise<Choice> {
  const total = o.analysis.summary.reduce((n, s) => n + s.count, 0);
  const list = h(
    'ul',
    { class: 'types' },
    ...o.analysis.summary.map((s) =>
      h(
        'li',
        {},
        h('span', { class: 'type' }, DETECTION_LABELS[s.type]),
        h('span', { class: 'count' }, `×${s.count}`),
        s.ai > 0 && h('span', { class: 'ai', title: 'Lo encontró la IA local' }, 'IA'),
        h('span', { class: 'examples' }, s.examples.join(' · ')),
      ),
    ),
  );
  const primary = h('button', { class: 'btn primary', value: 'proteger-enviar' }, 'Proteger y enviar');
  const dialog = h(
    'dialog',
    { class: 'ask', 'aria-labelledby': 'dg-title' },
    h(
      'form',
      { method: 'dialog' },
      h('header', {}, shield(), h('h2', { id: 'dg-title' }, total === 1 ? 'Tu prompt tiene un dato sensible' : `Tu prompt tiene ${total} datos sensibles`)),
      h('p', { class: 'lead' }, `Antes de enviarlo a ${o.site}, DataGuard los reemplaza por seudónimos. Tu prompt no sale de tu computadora.`),
      list,
      h('p', { class: 'label' }, 'Así se va a enviar'),
      h('pre', { class: 'preview' }, ...highlighted(o.protectedText, o.pseudonyms)),
      o.analysis.enforced &&
        h('p', { class: 'policy' }, `La política de ${o.organizacion ?? 'tu empresa'} pide proteger estos datos antes de usarlos con una IA.`),
      h(
        'footer',
        {},
        h('button', { class: 'btn link', value: 'proteger' }, 'Solo reemplazar'),
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn', value: 'cancelar' }, 'Cancelar'),
        !o.analysis.enforced && h('button', { class: 'btn', value: 'sin-proteger' }, 'Enviar sin proteger'),
        primary,
      ),
    ),
  );
  shadow().append(dialog);
  dialog.showModal();
  primary.focus();
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close('cancelar'); // clic en el fondo
  });
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => {
      dialog.remove();
      resolve((dialog.returnValue || 'cancelar') as Choice);
    });
  });
}

/** Si el sitio no aceptó el texto nuevo: se ofrece copiarlo para pegarlo a mano. */
export function showCopyFallback(protectedText: string): Promise<void> {
  const copy = h('button', { class: 'btn primary', type: 'button' }, 'Copiar texto protegido');
  const dialog = h(
    'dialog',
    { class: 'ask', 'aria-labelledby': 'dg-title' },
    h(
      'form',
      { method: 'dialog' },
      h('header', {}, shield(), h('h2', { id: 'dg-title' }, 'No pude reemplazar el texto')),
      h('p', { class: 'lead' }, 'El sitio no aceptó el cambio y tu prompt no se envió. Copiá la versión protegida, pegala en el cuadro y enviala.'),
      h('pre', { class: 'preview' }, protectedText),
      h('footer', {}, h('span', { class: 'spacer' }), h('button', { class: 'btn', value: 'cerrar' }, 'Cerrar'), copy),
    ),
  );
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(protectedText);
      copy.textContent = 'Copiado';
    } catch {
      copy.textContent = 'No se pudo copiar: seleccionalo a mano';
    }
  });
  shadow().append(dialog);
  dialog.showModal();
  copy.focus();
  return new Promise((resolve) => dialog.addEventListener('close', () => (dialog.remove(), resolve())));
}

// ---------- Indicador y seudónimos de la pestaña ----------

let pill: HTMLButtonElement | null = null;
let pillText: HTMLSpanElement | null = null;
let panel: HTMLDivElement | null = null;
let getRows: () => EquivalenceRow[] = () => [];
let onForget: () => void = () => {};
let idleText = 'DataGuard activo';

/** Indicador fijo abajo a la derecha: avisa mientras se escribe y abre la lista de seudónimos. */
export function mountIndicator(opts: { rows: () => EquivalenceRow[]; forget: () => void }): void {
  getRows = opts.rows;
  onForget = opts.forget;
  pillText = h('span', {}, idleText);
  pill = h('button', { class: 'pill', type: 'button', 'aria-expanded': 'false', title: 'DataGuard: ver los seudónimos de esta pestaña' }, shield(), pillText);
  pill.addEventListener('click', togglePanel);
  shadow().append(pill);
}

/** Texto del indicador cuando no hay nada que avisar (con la IA local activa lo dice). */
export function setAiActive(on: boolean): void {
  const next = on ? 'DataGuard activo · IA local' : 'DataGuard activo';
  if (pillText?.textContent === idleText) pillText.textContent = next;
  idleText = next;
}

/** Cantidad de datos sensibles en lo que se está escribiendo (0: ninguno). */
export function setPendingCount(count: number): void {
  if (!pill || !pillText) return;
  pill.classList.toggle('warn', count > 0);
  pillText.textContent = count === 0 ? idleText : count === 1 ? '1 dato sensible: se protege al enviar' : `${count} datos sensibles: se protegen al enviar`;
}

/** Al enviar, mientras la IA local termina de revisar el prompt. */
export function setChecking(): void {
  if (!pill || !pillText) return;
  pill.classList.remove('warn');
  pillText.textContent = 'Revisando con la IA local…';
}

function togglePanel() {
  if (panel) {
    closePanel();
    return;
  }
  const rows = getRows();
  const forget = h('button', { class: 'btn link', type: 'button' }, 'Olvidar seudónimos');
  forget.addEventListener('click', () => {
    onForget();
    closePanel();
  });
  panel = h(
    'div',
    { class: 'panel', role: 'dialog', 'aria-label': 'Seudónimos de esta pestaña' },
    h('p', { class: 'label' }, 'Seudónimos de esta pestaña'),
    rows.length === 0
      ? h('p', { class: 'muted' }, 'Todavía no se reemplazó nada. Cuando aparezcan en la respuesta de la IA, acá ves a quién corresponde cada uno.')
      : h('table', {}, h('tbody', {}, ...rows.map((r) => h('tr', {}, h('td', { class: 'mono' }, r.seudonimo), h('td', {}, r.original))))),
    h('p', { class: 'muted' }, 'Solo existen en esta pestaña: no se guardan en ningún lado y se borran al cerrarla.'),
    rows.length > 0 && forget,
  );
  shadow().append(panel);
  pill?.setAttribute('aria-expanded', 'true');
}

function closePanel() {
  panel?.remove();
  panel = null;
  pill?.setAttribute('aria-expanded', 'false');
}

/**
 * Estilos de la interfaz dentro de la página. Mismos colores que la app (design-system/securedata-ai):
 * navy, azul de acción brand-700 y ámbar para avisos. Fuente del sistema: no se carga nada del sitio.
 */
export const STYLES = `
:host {
  /* Primero se cortan los estilos que el sitio pueda heredar; después van los nuestros. */
  all: initial;
  --bg: #ffffff;
  --ink: #0f172a;
  --ink-2: #475569;
  --line: #e2e8f0;
  --soft: #f8fafc;
  --brand: #0369a1;
  --brand-hover: #075985;
  --warn-bg: #fffbeb;
  --warn-ink: #92400e;
  --warn-line: #fcd34d;
  --mark: #e0f2fe;
  --mark-ink: #075985;
  font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
  font-size: 14px;
  line-height: 1.45;
  color: var(--ink);
}
@media (prefers-color-scheme: dark) {
  :host {
    --bg: #0f172a;
    --ink: #f1f5f9;
    --ink-2: #94a3b8;
    --line: #334155;
    --soft: #1e293b;
    --brand: #0284c7;
    --brand-hover: #0369a1;
    --warn-bg: #422006;
    --warn-ink: #fcd34d;
    --warn-line: #92400e;
    --mark: #0c4a6e;
    --mark-ink: #e0f2fe;
  }
}
* { box-sizing: border-box; }
.shield { display: inline-flex; width: 18px; height: 18px; flex: none; }
.shield svg { width: 100%; height: 100%; }

dialog.ask {
  width: min(560px, calc(100vw - 32px));
  max-height: calc(100vh - 32px);
  overflow: auto;
  padding: 20px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--bg);
  color: var(--ink);
  box-shadow: 0 20px 50px rgb(15 23 42 / 0.25);
}
dialog.ask::backdrop { background: rgb(15 23 42 / 0.45); }
header { display: flex; align-items: center; gap: 10px; color: var(--brand); }
h2 { margin: 0; font-size: 17px; font-weight: 700; color: var(--ink); }
.lead { margin: 8px 0 14px; color: var(--ink-2); }
.types { list-style: none; margin: 0 0 14px; padding: 0; border: 1px solid var(--line); border-radius: 10px; }
.types li { display: flex; gap: 8px; align-items: baseline; padding: 8px 12px; }
.types li + li { border-top: 1px solid var(--line); }
.type { font-weight: 600; }
.count { color: var(--ink-2); font-variant-numeric: tabular-nums; }
.examples { margin-left: auto; color: var(--ink-2); font-family: ui-monospace, monospace; font-size: 12px; text-align: right; overflow-wrap: anywhere; }
.label { margin: 0 0 6px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--ink-2); }
.preview {
  margin: 0 0 14px;
  max-height: 180px;
  overflow: auto;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--soft);
  font: 13px/1.5 ui-monospace, monospace;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
mark { background: var(--mark); color: var(--mark-ink); border-radius: 4px; padding: 0 2px; }
.policy { margin: 0 0 14px; padding: 8px 12px; border-radius: 10px; background: var(--warn-bg); color: var(--warn-ink); border: 1px solid var(--warn-line); }
footer { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.spacer { flex: 1; }
.btn {
  min-height: 40px;
  padding: 0 14px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: var(--bg);
  color: var(--ink);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.btn:hover { background: var(--soft); }
.btn:focus-visible, .pill:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
.btn.primary { border-color: var(--brand); background: var(--brand); color: #fff; }
.btn.primary:hover { background: var(--brand-hover); }
.btn.link { border-color: transparent; background: none; color: var(--brand); padding: 0 4px; }

.pill {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 2147483646;
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: calc(100vw - 32px);
  padding: 6px 12px 6px 8px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--bg);
  color: var(--ink-2);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  box-shadow: 0 4px 14px rgb(15 23 42 / 0.12);
  cursor: pointer;
}
.pill .shield { color: var(--brand); width: 16px; height: 16px; }
.pill.warn { background: var(--warn-bg); color: var(--warn-ink); border-color: var(--warn-line); }
.pill.warn .shield { color: var(--warn-ink); }
.panel {
  position: fixed;
  right: 16px;
  bottom: 60px;
  z-index: 2147483646;
  width: min(340px, calc(100vw - 32px));
  max-height: 50vh;
  overflow: auto;
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--bg);
  color: var(--ink);
  box-shadow: 0 12px 32px rgb(15 23 42 / 0.2);
}
.panel table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
.panel td { padding: 4px 0; border-top: 1px solid var(--line); vertical-align: top; overflow-wrap: anywhere; }
.panel td.mono { padding-right: 12px; font-family: ui-monospace, monospace; font-size: 12px; color: var(--mark-ink); white-space: nowrap; }
.muted { margin: 0 0 8px; color: var(--ink-2); font-size: 12px; }
@media (prefers-reduced-motion: no-preference) {
  dialog.ask[open] { animation: dg-in 0.2s cubic-bezier(0.16, 1, 0.3, 1); }
  @keyframes dg-in { from { opacity: 0; transform: translateY(8px) scale(0.98); } }
}
`;

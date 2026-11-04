/**
 * Script de contenido en la app web y el panel de DataGuard (GitHub Pages): si el usuario ya inició sesión
 * ahí, le pasa el token al service worker para que la extensión quede conectada sin volver a escribir la
 * contraseña. Lee la misma clave que guardan las páginas (packages/shared/src/http.ts) y escucha el aviso
 * que mandan al iniciar sesión (y el cambio desde otra pestaña).
 */
import { TOKEN_KEY } from '@securedata/shared/http';
import type { PageSessionMessage } from '../lib/messages';

function share() {
  let token: string | null = null;
  try {
    token = localStorage.getItem(TOKEN_KEY);
  } catch {
    return;
  }
  if (!token) return;
  const message: PageSessionMessage = { tipo: 'sesion-pagina', token };
  chrome.runtime.sendMessage(message).catch(() => {});
}

share();
window.addEventListener('dataguard:sesion', share);
window.addEventListener('storage', (e) => {
  if (e.key === TOKEN_KEY) share();
});

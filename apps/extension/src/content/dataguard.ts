/**
 * Script de contenido en el panel de DataGuard (GitHub Pages): si el usuario ya inició sesión ahí, le pasa
 * el token al service worker para que la extensión quede conectada sin volver a escribir la contraseña.
 * Lee la misma clave que guarda el panel (apps/panel/src/api.ts) y escucha el aviso que manda al iniciar sesión.
 */
import type { PageSessionMessage } from '../lib/messages';

const TOKEN_KEY = 'dataguard_sesion';

function share() {
  let token: string | null = null;
  try {
    token = sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return;
  }
  if (!token) return;
  const message: PageSessionMessage = { tipo: 'sesion-pagina', token };
  chrome.runtime.sendMessage(message).catch(() => {});
}

share();
window.addEventListener('dataguard:sesion', share);

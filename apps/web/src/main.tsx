import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { restoreAi } from './lib/ai';

/**
 * En producción (GitHub Pages) el aislamiento de origen lo da un service worker: la primera vez se
 * registra y recarga la página una sola vez. Si no se puede, la IA local corre igual en un hilo.
 */
function enableIsolation() {
  if (!import.meta.env.PROD || self.crossOriginIsolated || !('serviceWorker' in navigator)) return;
  const KEY = 'dataguard.aislamiento-recargado';
  void navigator.serviceWorker
    .register(`${import.meta.env.BASE_URL}aislamiento-sw.js`)
    .then(() => navigator.serviceWorker.ready)
    .then(() => {
      try {
        if (sessionStorage.getItem(KEY)) return; // ya se recargó y no alcanzó: no insistir
        sessionStorage.setItem(KEY, '1');
      } catch {
        return;
      }
      location.reload();
    })
    .catch(() => {});
}

enableIsolation();
// Si el usuario ya activó la IA local, se carga desde el caché del navegador.
restoreAi();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

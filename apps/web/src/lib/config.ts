/**
 * Demo estática (GitHub Pages): la app que corre en el navegador, sin API (el panel va con datos ficticios).
 * Se activa con VITE_STATIC_DEMO=1 al compilar.
 */
export const STATIC_DEMO = import.meta.env.VITE_STATIC_DEMO === '1';

/** API en otro dominio (GitHub Pages → Supabase): hay cuenta y se registran eventos, con el panel al lado. */
const REMOTE_API = !!import.meta.env.VITE_API_URL;

/**
 * Dirección del panel del responsable: en desarrollo corre en otro puerto; en GitHub Pages se publica
 * al lado de la app, en /<repo>/panel/.
 */
export const PANEL_URL: string = STATIC_DEMO || REMOTE_API ? `${import.meta.env.BASE_URL}panel/` : (import.meta.env.VITE_PANEL_URL ?? 'http://localhost:5180');

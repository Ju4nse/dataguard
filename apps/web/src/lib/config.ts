/**
 * Demo estática (GitHub Pages): la app que corre en el navegador, sin API (el panel va con datos ficticios).
 * Se activa con VITE_STATIC_DEMO=1 al compilar.
 */
export const STATIC_DEMO = import.meta.env.VITE_STATIC_DEMO === '1';

/**
 * Dirección del panel del responsable: en desarrollo corre en otro puerto; en la demo estática se
 * publica al lado de la app, en /<repo>/panel/, con datos ficticios.
 */
export const PANEL_URL: string = STATIC_DEMO ? `${import.meta.env.BASE_URL}panel/` : (import.meta.env.VITE_PANEL_URL ?? 'http://localhost:5180');

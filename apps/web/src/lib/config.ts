/**
 * Demo estática (GitHub Pages): solo la app que corre en el navegador, sin API ni panel.
 * Se activa con VITE_STATIC_DEMO=1 al compilar.
 */
export const STATIC_DEMO = import.meta.env.VITE_STATIC_DEMO === '1';

/** Dirección del panel del responsable (en desarrollo corre en otro puerto); null si no hay panel. */
export const PANEL_URL: string | null = STATIC_DEMO ? null : (import.meta.env.VITE_PANEL_URL ?? 'http://localhost:5180');

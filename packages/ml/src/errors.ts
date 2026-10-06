/** Traduce los errores técnicos de la carga del modelo a algo que el usuario pueda resolver. */
export function friendlyAiError(message: string): string {
  if (/memory|allocat|RangeError|Aborted|out of bounds|OOM/i.test(message)) {
    return 'Tu equipo no tiene memoria suficiente para la IA local. Cerrá otras pestañas y probá de nuevo; sin IA, las reglas siguen protegiendo tus datos.';
  }
  if (/fetch|network|descargar|incompleta|load failed/i.test(message)) {
    return 'Se cortó la descarga del modelo. Revisá la conexión y probá de nuevo.';
  }
  if (/quota/i.test(message)) {
    return 'No hay espacio en el navegador para guardar el modelo. Liberá espacio y probá de nuevo.';
  }
  if (/WebAssembly|wasm|SIMD|backend/i.test(message)) {
    return 'Este navegador no pudo iniciar la IA local. Probá con Chrome, Edge o Firefox actualizados.';
  }
  return `No se pudo iniciar la IA local (${message}). Sin IA, las reglas siguen protegiendo tus datos.`;
}

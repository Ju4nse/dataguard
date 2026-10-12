/**
 * Compila la extensión en dist/ (cargala en chrome://extensions → "Cargar descomprimida").
 * Son dos compilaciones porque Chrome pide formatos distintos:
 *   1. Popup, service worker y documento oculto de la IA local: módulos ES (el manifest declara "type": "module").
 *   2. Script de contenido: un solo archivo clásico (IIFE); los content scripts no pueden importar módulos.
 * Uso: npm run build -w @securedata/extension   ·   npm run dev -w @securedata/extension (recompila al guardar)
 */
import { readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { build, type InlineConfig } from 'vite';

const root = import.meta.dirname;
const watch = process.argv.includes('--watch') ? {} : null;
/** --firefox: compila en dist-firefox/ (cargala en about:debugging → "Cargar complemento temporal"). */
const firefox = process.argv.includes('--firefox');
const outDir = firefox ? 'dist-firefox' : 'dist';

const extensionPages: InlineConfig = {
  root,
  configFile: false,
  plugins: [react(), tailwindcss()],
  // El worker de la IA local importa onnxruntime: tiene que ser un módulo.
  worker: { format: 'es' },
  build: {
    outDir,
    emptyOutDir: false,
    watch,
    // Sin polyfill de modulepreload: Chrome lo trae y la CSP de las extensiones no admite scripts en línea.
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: { popup: resolve(root, 'popup.html'), offscreen: resolve(root, 'offscreen.html'), background: resolve(root, 'src/background.ts') },
      output: { entryFileNames: '[name].js', chunkFileNames: 'chunks/[name]-[hash].js', assetFileNames: 'assets/[name]-[hash][extname]' },
    },
  },
};

const contentScript: InlineConfig = {
  root,
  configFile: false,
  publicDir: false,
  build: {
    outDir,
    emptyOutDir: false,
    watch,
    lib: { entry: resolve(root, 'src/content/index.ts'), formats: ['iife'], name: 'DataGuard', fileName: () => 'content.js' },
  },
};

// dist/ se vacía una sola vez: en modo --watch cada recompilación vaciaría lo que generó la otra.
await rm(resolve(root, outDir), { recursive: true, force: true });
await build(extensionPages);
await build(contentScript);
if (firefox) await adaptManifestForFirefox();

/**
 * Firefox no tiene service workers en las extensiones ni documentos ocultos: el fondo es una página
 * (background.scripts) y la IA corre en un iframe de esa página (ver background-ai.ts). La "key" es de Chrome;
 * en Firefox el id fijo va en browser_specific_settings.
 */
async function adaptManifestForFirefox() {
  const path = resolve(root, outDir, 'manifest.json');
  const { key: _key, ...manifest } = JSON.parse(await readFile(path, 'utf8'));
  manifest.background = { scripts: ['background.js'], type: 'module' };
  manifest.permissions = manifest.permissions.filter((p: string) => p !== 'offscreen');
  manifest.browser_specific_settings = {
    gecko: { id: 'dataguard@ju4nse.github.io', strict_min_version: '140.0', data_collection_permissions: { required: ['none'] } },
  };
  await writeFile(path, JSON.stringify(manifest, null, 2) + '\n');
}

/**
 * Compila la extensión en dist/ (cargala en chrome://extensions → "Cargar descomprimida").
 * Son dos compilaciones porque Chrome pide formatos distintos:
 *   1. Popup y service worker: módulos ES (el manifest declara "type": "module").
 *   2. Script de contenido: un solo archivo clásico (IIFE); los content scripts no pueden importar módulos.
 * Uso: npm run build -w @securedata/extension   ·   npm run dev -w @securedata/extension (recompila al guardar)
 */
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { build, type InlineConfig } from 'vite';

const root = import.meta.dirname;
const watch = process.argv.includes('--watch') ? {} : null;

const extensionPages: InlineConfig = {
  root,
  configFile: false,
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    watch,
    // Sin polyfill de modulepreload: Chrome lo trae y la CSP de las extensiones no admite scripts en línea.
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: { popup: resolve(root, 'popup.html'), background: resolve(root, 'src/background.ts') },
      output: { entryFileNames: '[name].js', chunkFileNames: 'chunks/[name]-[hash].js', assetFileNames: 'assets/[name]-[hash][extname]' },
    },
  },
};

const contentScript: InlineConfig = {
  root,
  configFile: false,
  publicDir: false,
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    watch,
    lib: { entry: resolve(root, 'src/content/index.ts'), formats: ['iife'], name: 'DataGuard', fileName: () => 'content.js' },
  },
};

// dist/ se vacía una sola vez: en modo --watch cada recompilación vaciaría lo que generó la otra.
await rm(resolve(root, 'dist'), { recursive: true, force: true });
await build(extensionPages);
await build(contentScript);

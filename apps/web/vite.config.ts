import { createReadStream, existsSync, statSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Connect, type Plugin } from 'vite';

/**
 * Solo en local (dev y preview): sirve los modelos de IA descargados en .cache/modelos bajo
 * <base>modelos/, para probar la IA local sin publicar el modelo (ver README, "IA local").
 */
function localModels(): Plugin {
  const root = resolve(import.meta.dirname, '../../.cache/modelos');
  let mount = '/modelos';
  const serve: Connect.NextHandleFunction = (req, res, next) => {
    const file = resolve(root, decodeURIComponent((req.url ?? '').split('?')[0]!).replace(/^\/+/, ''));
    if (!file.startsWith(root + sep) || !existsSync(file) || !statSync(file).isFile()) return next();
    res.setHeader('Content-Length', statSync(file).size);
    res.setHeader('Content-Type', 'application/octet-stream');
    createReadStream(file).pipe(res);
  };
  return {
    name: 'modelos-locales',
    configResolved(config) {
      mount = `${config.base}modelos`;
    },
    configureServer(server) {
      server.middlewares.use(mount, serve);
    },
    configurePreviewServer(server) {
      server.middlewares.use(mount, serve);
    },
  };
}

/**
 * Aislamiento de origen (COOP/COEP) en desarrollo: habilita SharedArrayBuffer y con eso varios hilos
 * para la IA local. Va como middleware porque `server.headers` no llega a los workers que transforma Vite.
 */
function crossOriginIsolation(): Plugin {
  return {
    name: 'aislamiento-de-origen',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((_req, res, next) => {
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
        res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
        next();
      });
    },
  };
}

export default defineConfig({
  // En GitHub Pages la app vive en /<repo>/ (lo define el workflow de deploy).
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), tailwindcss(), crossOriginIsolation(), localModels()],
  worker: { format: 'es' },
  // Dependencias que solo usan los workers: si Vite las descubre tarde, las re-optimiza y recarga la página.
  optimizeDeps: { include: ['mammoth', 'papaparse', 'xlsx', 'onnxruntime-web/wasm', '@huggingface/tokenizers'] },
  // La API corre aparte (npm run dev -w @securedata/api); el proxy mantiene la cookie en el mismo origen.
  server: { proxy: { '/api': 'http://localhost:8787' } },
});

import { relative } from 'node:path';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import app from './app';
import { config } from './config';

// Servidor: la API en /api y, si se compiló, el panel en el resto (un solo puerto para publicar con tailscale serve).
const server = new Hono();
server.route('/', app);
if (config.panelDir) {
  const root = relative(process.cwd(), config.panelDir) || '.';
  server.use('*', secureHeaders());
  server.use('/*', serveStatic({ root }));
  // Rutas del panel que no son archivos: la aplicación de una sola página.
  server.get('*', serveStatic({ root, path: 'index.html' }));
}

if (config.mfaDisabled) {
  console.warn('⚠ SEGUNDO FACTOR DESACTIVADO (DESACTIVAR_2FA=1): solo para desarrollo o demo, nunca en una instalación real.');
}

serve({ fetch: server.fetch, port: config.port, hostname: config.host }, (info) => {
  console.log(`API de DataGuard en http://${config.host}:${info.port}/api${config.panelDir ? ' (y el panel en /)' : ''}`);
});

export default server;

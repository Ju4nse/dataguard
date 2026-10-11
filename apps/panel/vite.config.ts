import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // En GitHub Pages la demo del panel vive en /<repo>/panel/ (ver .github/workflows/pages.yml).
  base: process.env.BASE_PATH ?? '/',
  server: {
    port: 5180,
    strictPort: true,
    // La API corre aparte; con el proxy la cookie de sesión queda en el mismo origen.
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
});

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5180,
    strictPort: true,
    // La API corre aparte; con el proxy la cookie de sesión queda en el mismo origen.
    proxy: { '/api': 'http://localhost:8787' },
  },
});

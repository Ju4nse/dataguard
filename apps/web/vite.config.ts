import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  worker: { format: 'es' },
  // La API corre aparte (npm run dev -w @securedata/api); el proxy mantiene la cookie en el mismo origen.
  server: { proxy: { '/api': 'http://localhost:8787' } },
});

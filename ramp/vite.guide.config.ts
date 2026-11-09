// Builds the guide as a standalone page (dist-guide/) for sharing outside the app.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  publicDir: false,
  build: { outDir: 'dist-guide', emptyOutDir: true, chunkSizeWarningLimit: 900, rollupOptions: { input: 'guide.html' } },
});

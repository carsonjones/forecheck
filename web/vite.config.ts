import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:8787',
      '/admin': 'http://localhost:8787',
    },
  },
  build: {
    sourcemap: true,
  },
  resolve: {
    alias: {
      '@web': new URL('./src', import.meta.url).pathname,
    },
  },
});

import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  publicDir: 'Anikume/public',
  plugins: [react(), tailwindcss()],
  define: {
    'process.env': {},
  },
  esbuild: {
    sourcemap: false,
    sourcesContent: false,
    drop: ['debugger'],
  },
  css: {
    devSourcemap: false,
  },
  build: {
    sourcemap: false,
    minify: 'esbuild',
  },
  server: {
    sourcemapIgnoreList: () => true,
    fs: {
      deny: ['Apikume/**', 'server.ts', '.env*', 'node_modules/**'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './Anikume/src'),
    },
  },
});

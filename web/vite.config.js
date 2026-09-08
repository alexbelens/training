import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  root,
  plugins: [react()],
  resolve: { alias: { '@shared': path.resolve(root, '..', 'shared') } },
  server: { port: 5173, proxy: { '/api': 'http://localhost:8080' }, fs: { allow: [path.resolve(root, '..')] } },
  build: { outDir: path.resolve(root, '..', 'dist', 'web'), emptyOutDir: true },
});

import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { defineConfig } from 'vitest/config';

// jsPDF loads these three only for features this app never calls (rendering
// HTML or bitmap SVG into a PDF). Pointing them at an empty module keeps them
// out of the single-file build.
const unused = fileURLToPath(new URL('./src/export/unused-module.ts', import.meta.url));

export default defineConfig({
  // relative paths, so the built page also works when opened straight from disk
  base: './',
  plugins: [react(), viteSingleFile()],
  resolve: {
    alias: {
      html2canvas: unused,
      dompurify: unused,
      canvg: unused,
    },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 8000,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});

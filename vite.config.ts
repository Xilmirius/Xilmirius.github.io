import { defineConfig } from 'vite';

// base './' para que el build funcione en cualquier subruta (GitHub Pages, itch.io, Netlify...).
export default defineConfig({
  base: './',
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
  test: {
    include: process.env.VITEST_TOOLS ? ['tests/tools/*.test.ts'] : ['tests/*.test.ts'],
    environment: 'node',
  },
} as any);

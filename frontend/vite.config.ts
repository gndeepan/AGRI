/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') }, dedupe: ['three', 'react', 'react-dom'] },
  server: {
    port: 5173,
    // Inside Docker (VITE_API_PROXY is set by compose) bind-mount file events are unreliable on macOS.
    watch: process.env.VITE_API_PROXY ? { usePolling: true, interval: 300 } : undefined,
    proxy: {
      '/api': { target: process.env.VITE_API_PROXY || 'http://localhost:8000', changeOrigin: true },
    },
  },
  worker: { format: 'es' },
  build: {
    chunkSizeWarningLimit: 1300,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    testTimeout: 15000, // full-suite runs on busy dev machines and CI regularly exceed the 5 s default
  },
})

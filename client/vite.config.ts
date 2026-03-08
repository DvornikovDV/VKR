import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],

  // ── Path aliases ──────────────────────────────────────────────────────────
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },

  // ── Dev-server proxy ──────────────────────────────────────────────────────
  // T003: /api → http://localhost:4000  |  /socket.io → ws://localhost:4000
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        secure: false,
      },
      '/socket.io': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        ws: true,           // WebSocket proxy
        secure: false,
      },
    },
  },

  // ── Vitest ────────────────────────────────────────────────────────────────
  // T001b: jsdom environment, global APIs, setup file
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/main.tsx', 'src/**/*.d.ts'],
    },
  },
})

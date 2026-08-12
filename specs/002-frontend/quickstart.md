# Frontend SPA Quickstart

## Prerequisites
- Node.js (v20+)
- Valid API Endpoints and Edge Server running (or simulated)

## Installation

1. Navigate to the SPA client module directory:
   ```bash
   cd client
   ```

2. Install dependencies from the checked-in manifest:
   ```bash
   npm install
   ```

3. Styling is already wired for Tailwind CSS 4 through `@tailwindcss/vite` in `client/vite.config.ts` and `@import "tailwindcss"` in `client/src/index.css`; no core `tailwind.config.ts` setup is required for the base flow.

## Local Development

Start the development server with Vite:
```bash
npm run dev
```

By default it will run on `http://127.0.0.1:3000/`.

By default the dev proxy forwards `/api` and `/socket.io` to `http://localhost:4000`.
This can be overridden through `VITE_API_PROXY_PROTOCOL`, `VITE_API_PROXY_HOST`, and `VITE_API_PROXY_PORT`.

Relevant `vite.config.ts` shape:

```typescript
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        secure: false
      },
      '/socket.io': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        ws: true,
        secure: false
      }
    }
  }
});
```

## Simulated Authentication

If developing pure UI, mock `/api/auth/*` responses with MSW or seed session state through `useAuthStore`; keep the session in Zustand memory-state rather than introducing local storage JWT persistence.

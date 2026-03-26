import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'
import { extname, resolve } from 'path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
// @ts-ignore Vite tooling helper is authored as plain .mjs.
import { CONSTRUCTOR_PUBLIC_SOURCE_DIR, cleanLegacyHostedConstructorStagingDir, listHostedConstructorAssetFiles, resolveHostedConstructorSourceFile } from './scripts/hostedConstructorAssetsPipeline.mjs'

const HOSTED_CONSTRUCTOR_PUBLIC_PREFIX = '/constructor/'
const CLIENT_ROOT_DIR = fileURLToPath(new URL('.', import.meta.url))

function toPosixPath(pathValue: string): string {
  return pathValue.replace(/\\/g, '/')
}

function getHostedConstructorAssetContentType(filePath: string): string {
  switch (extname(filePath).toLowerCase()) {
    case '.js':
      return 'text/javascript; charset=utf-8'
    case '.css':
      return 'text/css; charset=utf-8'
    case '.json':
      return 'application/json; charset=utf-8'
    case '.svg':
      return 'image/svg+xml'
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.gif':
      return 'image/gif'
    case '.webp':
      return 'image/webp'
    default:
      return 'application/octet-stream'
  }
}

function stripQueryAndHash(pathValue: string): string {
  return pathValue.split('#', 1)[0].split('?', 1)[0]
}

function hostedConstructorAssetsPlugin(): Plugin {
  const sourceRoot = toPosixPath(CONSTRUCTOR_PUBLIC_SOURCE_DIR)

  return {
    name: 'hosted-constructor-assets-pipeline',
    buildStart() {
      // Keep the one-way source-of-truth rule strict: never build from stale /client/public/constructor copies.
      cleanLegacyHostedConstructorStagingDir()
    },
    generateBundle() {
      for (const assetFile of listHostedConstructorAssetFiles()) {
        this.emitFile({
          type: 'asset',
          fileName: `constructor/${assetFile.relativePath}`,
          source: readFileSync(assetFile.absolutePath),
        })
      }
    },
    configureServer(server) {
      cleanLegacyHostedConstructorStagingDir()

      server.middlewares.use((request, response, next) => {
        const requestMethod = request.method ?? 'GET'
        if (requestMethod !== 'GET' && requestMethod !== 'HEAD') {
          next()
          return
        }

        const requestPath = stripQueryAndHash(request.url ?? '')
        if (!requestPath.startsWith(HOSTED_CONSTRUCTOR_PUBLIC_PREFIX)) {
          next()
          return
        }

        let relativeAssetPath = ''
        try {
          relativeAssetPath = decodeURIComponent(
            requestPath.slice(HOSTED_CONSTRUCTOR_PUBLIC_PREFIX.length),
          )
        } catch {
          response.statusCode = 400
          response.end('Bad Request')
          return
        }

        const sourceAssetPath = resolveHostedConstructorSourceFile(relativeAssetPath)
        if (!sourceAssetPath) {
          next()
          return
        }

        response.statusCode = 200
        response.setHeader('Cache-Control', 'no-store')
        response.setHeader('Content-Type', getHostedConstructorAssetContentType(sourceAssetPath))
        if (requestMethod === 'HEAD') {
          response.end()
          return
        }

        response.end(readFileSync(sourceAssetPath))
      })

      server.watcher.add(CONSTRUCTOR_PUBLIC_SOURCE_DIR)

      server.watcher.on('all', (_eventName, filePath) => {
        const normalizedPath = toPosixPath(filePath)
        const isInsideConstructorPublic =
          normalizedPath === sourceRoot || normalizedPath.startsWith(`${sourceRoot}/`)

        if (!isInsideConstructorPublic) {
          return
        }

        server.ws.send({ type: 'full-reload' })
      })
    },
  }
}

export default defineConfig({
  plugins: [hostedConstructorAssetsPlugin(), react(), tailwindcss()],
  resolve: {
    alias: {
      '@': resolve(CLIENT_ROOT_DIR, 'src'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 3000,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        secure: false,
      },
      '/socket.io': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        ws: true,
        secure: false,
      },
    },
  },
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

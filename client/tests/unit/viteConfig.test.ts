// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from '@/shared/api/client'
import viteConfig from '../../vite.config'

type EnvOverrides = Record<string, string | undefined>

function resolveViteConfig(overrides: EnvOverrides = {}) {
  const previousValues = new Map<string, string | undefined>()

  for (const [key, value] of Object.entries(overrides)) {
    previousValues.set(key, process.env[key])
    if (value === undefined) {
      delete process.env[key]
      continue
    }

    process.env[key] = value
  }

  try {
    return typeof viteConfig === 'function'
      ? viteConfig({ command: 'serve', mode: 'test', isPreview: false })
      : viteConfig
  } finally {
    for (const [key, value] of previousValues) {
      if (value === undefined) {
        delete process.env[key]
        continue
      }

      process.env[key] = value
    }
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('vite config security hardening', () => {
  it('uses IPv4 loopback by default for stable local access', () => {
    const config = resolveViteConfig()

    expect(config.server?.host).toBe('127.0.0.1')
    expect(config.server?.port).toBe(3000)
  })

  it('allows explicit dev host override for VPN or LAN access', () => {
    const config = resolveViteConfig({
      VITE_DEV_SERVER_HOST: '0.0.0.0',
    })

    expect(config.server?.host).toBe(true)
  })

  it('builds local proxy settings from validated env values', () => {
    const config = resolveViteConfig({
      VITE_DEV_SERVER_HOST: '127.0.0.1',
      VITE_DEV_SERVER_PORT: '3100',
      VITE_API_PROXY_PROTOCOL: 'https',
      VITE_API_PROXY_HOST: 'cloud.internal',
      VITE_API_PROXY_PORT: '4443',
    })

    expect(config.server?.port).toBe(3100)
    expect(config.server?.proxy?.['/api']).toMatchObject({
      target: 'https://cloud.internal:4443',
      changeOrigin: true,
      secure: false,
    })
    expect(config.server?.proxy?.['/socket.io']).toMatchObject({
      target: 'https://cloud.internal:4443',
      changeOrigin: true,
      ws: true,
      secure: false,
    })
  })

  it('fails fast on invalid proxy protocol values', () => {
    expect(() =>
      resolveViteConfig({
        VITE_API_PROXY_PROTOCOL: 'ftp',
      }),
    ).toThrowError(/VITE_API_PROXY_PROTOCOL/)
  })

  it('keeps API requests on relative client paths instead of hardcoded runtime URLs', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'success', data: { ok: true } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    vi.stubGlobal('fetch', fetchSpy)

    await expect(apiClient.get<{ ok: boolean }>('/health', { skipAuth: true })).resolves.toEqual({
      ok: true,
    })
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/health',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      }),
    )
  })
})

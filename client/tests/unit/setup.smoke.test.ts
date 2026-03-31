// Smoke test - Phase 1 setup validation.
// Verifies that the test environment and app entry points are wired correctly.
import { describe, it, expect } from 'vitest'

describe('Phase 1 setup smoke test', () => {
  it('test environment is jsdom', () => {
    expect(typeof window).toBe('object')
    expect(typeof document).toBe('object')
  })

  it('imports resolve correctly', async () => {
    const { router } = await import('@/app/routes')
    expect(router).toBeDefined()
  })

  it('styling entry imports correctly', async () => {
    await expect(import('@/index.css')).resolves.toBeDefined()
  })
})

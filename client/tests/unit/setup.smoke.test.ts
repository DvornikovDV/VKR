// Smoke test — Phase 1 Setup validation
// Verifies that the test environment is correctly configured.
import { describe, it, expect } from 'vitest'

describe('Phase 1 — Setup smoke test', () => {
    it('test environment is jsdom', () => {
        expect(typeof window).toBe('object')
        expect(typeof document).toBe('object')
    })

    it('imports resolve correctly', async () => {
        // Verifies that the module graph is reachable
        const { router } = await import('@/app/routes')
        expect(router).toBeDefined()
    })
})

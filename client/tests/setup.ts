// T001b — Vitest + React Testing Library + MSW global setup
import '@testing-library/jest-dom'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { server } from './mocks/server'

// ── MSW ───────────────────────────────────────────────────────────────────
// Start MSW service worker before all tests, reset handlers between tests,
// stop after all tests complete.
beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

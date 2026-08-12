# Test Report

**Date**: 2026-03-25 20:13:06 +09:00
**Framework**: Vitest
**Status**: PASS
**Scope**: 003-dashboard (`client` workspace)

## Summary

| Metric | Value |
|--------|-------|
| Total Test Suites | 48 |
| Passed Test Suites | 48 |
| Failed Test Suites | 0 |
| Total Tests | 81 |
| Passed | 81 |
| Failed | 0 |
| Skipped/Pending | 0 |
| Duration | 6.91s |
| Coverage | Not available |

## Failed Tests

No failing tests.

## Coverage

Coverage collection is currently unavailable in `client` because Vitest reports a missing dependency:

- `Cannot find dependency '@vitest/coverage-v8'`

Attempted command:

- `npx vitest run --coverage --reporter=json`

## 003-dashboard Relevant Test Files (all passed)

- `tests/integration/DashboardPage.test.tsx` (12 tests)
- `tests/unit/dashboardFoundations.test.ts` (6 tests)
- `tests/unit/bindingValidation.test.ts` (3 tests)
- `tests/unit/dashboardRuntimeProjection.test.ts` (2 tests)
- `tests/unit/useDashboardRuntimeSession.test.ts` (4 tests)

## Next Actions

1. Install coverage provider in `client` (for example `@vitest/coverage-v8`) to enable coverage metrics.
2. Re-run `npx vitest run --coverage --reporter=json`.
3. If needed, export coverage summary by file (lines/branches/functions) into this report.

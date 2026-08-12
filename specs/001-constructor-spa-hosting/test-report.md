# Test Report

**Date**: 2026-03-25 11:51:14 +00:00  
**Framework**: Vitest  
**Status**: PASS

## Summary

| Metric | Value |
|--------|-------|
| Total Test Suites | 54 |
| Passed Test Suites | 54 |
| Failed Test Suites | 0 |
| Total Tests | 93 |
| Passed | 93 |
| Failed | 0 |
| Skipped/Pending | 0 |
| Duration | 7.86s |
| Coverage (Statements) | 67.50% |
| Coverage (Lines) | 67.52% |
| Coverage (Branches) | 58.00% |
| Coverage (Functions) | 68.18% |

## Feature-Relevant Suites (`001-constructor-spa-hosting`)

| Suite | Total | Passed | Failed | Skipped | Duration |
|------|------:|------:|------:|------:|------:|
| `bindingsAdapter.test.ts` | 6 | 6 | 0 | 0 | 0.02s |
| `ConstructorHostFoundation.test.tsx` | 4 | 4 | 0 | 0 | 1.31s |
| `FullConstructorPageRecovery.test.tsx` | 2 | 2 | 0 | 0 | 1.52s |
| `HostedConstructorRoutes.test.tsx` | 4 | 4 | 0 | 0 | 1.65s |
| `HostedConstructorSaveFlow.test.tsx` | 3 | 3 | 0 | 0 | 4.14s |
| `FullConstructorBindings.test.tsx` | 3 | 3 | 0 | 0 | 1.79s |
| `ReducedConstructorPage.test.tsx` | 3 | 3 | 0 | 0 | 2.79s |
| `HostedConstructorUnsavedChanges.test.tsx` | 3 | 3 | 0 | 0 | 1.37s |
| `useHostedLayoutSaveFlow.test.tsx` | 4 | 4 | 0 | 0 | 0.18s |

## Failed Tests

No failed tests.

## Coverage by File (Hosted Constructor Scope)

| File | Lines | Branches | Functions |
|------|------:|---------:|----------:|
| `src/features/constructor-host/adapters/layoutAdapter.ts` | 90.48% | 87.18% | 100.00% |
| `src/features/constructor-host/adapters/bindingsAdapter.ts` | 91.43% | 85.71% | 100.00% |
| `src/features/constructor-host/adapters/catalogAdapter.ts` | 88.57% | 65.00% | 92.31% |
| `src/features/constructor-host/useHostedLayoutSaveFlow.ts` | 95.65% | 84.62% | 100.00% |
| `src/features/constructor-host/loadHostedConstructor.ts` | 80.00% | 75.00% | 85.71% |
| `src/features/constructor-host/ConstructorHost.tsx` | 78.51% | 68.33% | 62.07% |
| `src/features/admin-hub/pages/ReducedConstructorPage.tsx` | 78.69% | 68.18% | 100.00% |
| `src/features/constructor-host/useUnsavedChangesGuard.ts` | 75.86% | 71.43% | 80.00% |
| `src/features/user-hub/pages/FullConstructorPage.tsx` | 55.09% | 42.50% | 48.28% |

## Next Actions

1. Keep increasing branch coverage in `FullConstructorPage.tsx` (runtime-not-ready and destructive-save error branches still remain).
2. Add one more integration scenario for machine-catalog failure and retry to further improve page-level resilience coverage.
3. Keep full raw run output for debugging in `client/coverage/test-results.json`.

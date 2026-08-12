# Implementation Plan: Frontend SPA Infrastructure

**Branch**: `002-frontend` | **Date**: 2026-03-04 | **Spec**: `/specs/002-frontend/spec.md`
**Input**: Feature specification from `/specs/002-frontend/spec.md`

## Summary

This feature establishes the Single Page Application (SPA) for the VKR SCADA system.
The SPA is housed in **`/client`** — a new, dedicated module — not in `/dashboard`.

- `/dashboard` remains a Vanilla JS Operator Client (Konva renderer, live telemetry view).
- `/constructor` remains a Vanilla JS Visual Editor (Konva canvas).
- `/client` embeds both via React wrapper components (FR-017), providing the unified shell: public landing zone, Admin Hub, and User Hub.

## Technical Context

**Language/Version**: TypeScript 5+
**Primary Dependencies**: React (19.2.4), Vite (7.3.1), TailwindCSS (4.2.1), Zustand (5.0.11), React Router v7+
**Storage**: Client-side state (Zustand), JWT token in Zustand memory-state
**Testing**: Vitest, React Testing Library, MSW (Mock Service Worker for REST), `vi.spyOn` for WebSocket
**Target Platform**: Web Browsers (SPA served via Nginx as static bundle)
**Project Type**: Web Application (Frontend SPA — new `/client` module in monorepo)
**Performance Goals**:
  - SPA route transitions < 1s (SC-002)
  - WS disconnect indicator within 3s (SC-006)
  - Binding set operations < 2s (SC-007)
  - Dashboard dropdown switch < 1.5s (SC-008)
  - Edge status updates reflected within 5s (SC-004)
  - 100% pass rate for all specified test suites (SC-009)
**Constraints**: Must wrap existing Vanilla JS modules without rewriting them. Strict Role-based access. FREE tier limits enforced client-side before any network call (SC-005).

## Constitution Check

*GATE: Passed with clarification*

- **Principle 2**: Architecture scope clarified — `/client` is a new module added to the monorepo structure as the SPA shell. `/dashboard` and `/constructor` retain their original roles and are embedded via wrappers (not rewritten). This aligns with the constitution without modification.
- **Principle 3**: Vanilla JS modules integrated via `useRef` mount-only wrappers. No direct cross-module JS imports.
- **Principle 4**: No `window.*` or `global.*`. All state via Zustand stores.
- **Principle 5**: JWT token in Zustand memory-state only. No hardcoded secrets.

## Project Structure

### Documentation (this feature)

```text
specs/002-frontend/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── tasks.md             # Phase 2 output
└── contracts/
    └── api.md
```

### Source Code (repository root)

```text
client/                         # NEW module — React SPA shell
├── src/
│   ├── app/                    # Router, providers, global layout
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── routes.tsx
│   ├── features/
│   │   ├── auth/               # Login & Register pages, auth hooks
│   │   │   ├── pages/
│   │   │   │   ├── LoginPage.tsx
│   │   │   │   └── RegisterPage.tsx
│   │   │   └── hooks/
│   │   │       ├── useLogin.ts
│   │   │       └── useRegister.ts
│   │   ├── public/             # Landing page (/)
│   │   ├── admin-hub/          # Overview, EdgeFleet, UserMgmt, ReducedConstructor
│   │   ├── user-hub/           # Gallery, FullConstructor, Dashboard, Equipment, Profile
│   │   ├── constructor-wrapper/ # React ref-wrapper for /constructor Vanilla module
│   │   └── dashboard-wrapper/  # React ref-wrapper for /dashboard Vanilla module
│   ├── shared/
│   │   ├── api/                # REST API client (JWT injection, typed calls)
│   │   ├── store/              # Zustand stores (auth, telemetry)
│   │   ├── hooks/              # useEdgeStatus (reads from telemetry store, fallback REST), useDiagramLimits, etc.
│   │   └── components/         # ProtectedRoute, AppShell, modals, badges
│   └── index.css               # Tailwind base entries
├── tests/                      # Test suite (flat by domain, no src/ mirroring)
│   ├── unit/
│   │   ├── useAuthStore.test.ts
│   │   ├── useTelemetryStore.test.ts
│   │   ├── useDiagramLimits.test.ts
│   │   └── apiClient.test.ts
│   └── integration/
│       ├── ProtectedRoute.test.tsx
│       ├── GalleryPage.test.tsx
│       ├── DashboardPage.test.tsx
│       ├── SaveConflictModal.test.tsx
│       └── BindingsInvalidatedModal.test.tsx
├── GEMINI.md
├── package.json
├── tailwind.config.ts
├── tsconfig.json
└── vite.config.ts

dashboard/                      # EXISTING Vanilla JS Operator Client (Konva renderer)
└── GEMINI.md                   # Scope: live mnemonic rendering only

constructor/                    # EXISTING Vanilla JS Visual Editor (Konva canvas)
└── GEMINI.md
```

**Structure Decision**: New `/client` module with FSD-lite feature organization. All paths in tasks.md use `client/src/` prefix.

## Compatibility Note

| Package | Version | Compatibility |
|---|---|---|
| React | 19.2.4 | Requires React Router v7+ |
| Vite | 7.3.1 | Requires Node.js 20+ |
| TailwindCSS | 4.2.1 | New CSS-first config (no tailwind.config.js for core, use `@import "tailwindcss"`) |
| Zustand | 5.0.11 | Breaking changes vs v4 — use `useStore` pattern, not `create` with object |

## Complexity Tracking

No constitution violations.

# Phase 0: Research & Technical Architecture

## Technical Context Unknowns Resolved

Based on the prompt, we had specific requirements to validate versions and design integration approaches for a modern React stack.

### Decision 1: Versions and Tooling
- **Decision**: React 19.2.4, Vite 7.3.1, TailwindCSS 4.2.1, and Zustand 5.0.11 will be used as the foundational stack.
- **Rationale**: User explicitly requested utilizing the latest dependencies. Using Vite ensures near-instant HMR and fast builds. Tailwind provides utility-first styling for scalable design systems without cascading style issues. Zustand offers minimal-boilerplate global state management.
- **Alternatives considered**: Redux Toolkit (too much boilerplate for this scope), Create React App (deprecated and slow).

### Decision 2: Routing Architecture
- **Decision**: React Router (latest v7) configured with protective route guards based on Role (Admin vs User).
- **Rationale**: Built-in support for nested routing and loader/action patterns. Route guards will strictly enforce the "non-overlapping hubs" requirement by immediately checking `session` state and redirecting unauthorized access.

### Decision 3: Vanilla JS Integration Boundary
- **Decision**: Provide a standard React wrapper integration for the existing `/constructor` runtime using `useRef` and `useEffect`, while treating Dashboard runtime behavior as a separate native feature owned by `003-dashboard`.
- **Rationale**: This keeps `002-frontend` focused on SPA shell concerns and constructor hosting without reintroducing a hosted legacy Dashboard wrapper that would compete with the native Dashboard ownership boundary.
- **Alternatives considered**: Web Components / Custom Elements (could conflict with existing React build chains, ref wrapper is standard practice in React-D3 and React-Konva bridges).

### Decision 4: Global State Management (Zustand)
- **Decision**: Isolate state into separate bounded stores (e.g., `useAuthStore`, `useUiStore`, `useTelemetryStore`).
- **Rationale**: Avoids monolithic stores and unnecessary re-renders. The `useAuthStore` drives route guard checks, and `useTelemetryStore` holds socket connectivity context for the UI components outside the vanilla canvas.

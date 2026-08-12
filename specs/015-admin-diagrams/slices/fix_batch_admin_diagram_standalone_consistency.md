# Fix Batch: Standalone Diagram Consistency

## Goal

Remove crash-prone persisted User lock fields while preserving standalone MongoDB
support and the existing independent-copy assignment model.

## Boundaries

- MongoDB replica-set transactions are not required.
- Named unique diagram indexes remain the atomic authority for FREE quota slots
  and duplicate assignment provenance.
- Resource leases coordinate normal production writers but do not pretend to
  make multi-document operations atomic.
- Rare partial multi-document states must be repairable by an idempotent command.

## Tasks

- [X] S001 Add a standalone-compatible expiring resource lease with token-owned
  release, bounded acquisition, stable multi-resource ordering, and renewal.
- [X] S002 Remove `diagramQuotaMutationPending` and
  `diagramQuotaActiveCreates` from the active User model and coordinate diagram
  quota operations through `user:<id>` leases.
- [X] S003 Coordinate assignment, update, and delete through
  `diagram:<id>` leases; assignment must re-read the template and target after
  acquiring both template and target User leases.
- [X] S004 Coordinate ban, self-delete, and tier changes through the same User
  lease used by create, Save As, assignment, deletion, and reconciliation.
- [X] S005 Add an idempotent repair command for orphan bindings, quota slots,
  and obsolete persisted lock fields.
- [X] S006 Add focused automated proof for lease expiry/ownership, concurrent
  quota and duplicate protection, stale eligibility/template coordination, and
  repair behavior on standalone MongoDB.

## Closure Invariants

- A crashed process cannot permanently block later diagram operations.
- Assignment reads the persisted template and target eligibility while holding
  the corresponding resource leases.
- Normal production paths serialize quota and eligibility changes per User.
- FREE quota and duplicate assignment remain enforced by named unique indexes.
- Failed multi-document operations may leave only documented repairable states.
- The Cloud Server remains compatible with standalone MongoDB.

## Verification

- `cmd /c npm run typecheck`
- Focused standalone consistency regression: 59 tests passed.
- Full Cloud regression: 208 tests passed.
- ESLint passed for all changed source and test files.
- Repository-wide ESLint remains blocked by four pre-existing unused-variable
  errors in unrelated command RPC and diagram-binding command tests.

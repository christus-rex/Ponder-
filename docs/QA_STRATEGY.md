# Ponder+ QA Strategy v0

## Pull-request gates
1. Domain unit tests.
2. Strict TypeScript checks.
3. Migration review for destructive or privilege-expanding SQL.
4. Manual security review for auth, RLS, economy, moderation, and roles.

## Highest-risk invariants
### Economy
- Ledger rows cannot be updated/deleted.
- Gift settlement has a unique correlation ID.
- Amounts are positive integers.
- Self-gifting and insufficient balances are rejected server-side.

### Safety
- 18+ data is private.
- Users can block/report.
- Enforcement state is not client-writable.
- Durable chat writes stay server-controlled until moderation is enforced.

### Live
- Media tokens are short-lived/server-issued.
- Host/moderator roles cannot be self-assigned.
- Reconnect must be tested under network transitions before beta.

## Test pyramid
- Unit: pure domain invariants.
- DB integration: migration + RLS allow/deny matrix + ledger immutability.
- Service integration: media token, R2 signed upload, moderation.
- Mobile: onboarding, room entry, block/report.
- E2E: creator starts room -> viewer joins -> chat -> demo gift -> report/block -> room ends.

## Beta exit
- No known critical auth/RLS bypass.
- No duplicate gift settlement under retry tests.
- Block/report accessible from all live-room surfaces.
- Reconnect does not duplicate participant identity.
- Join success and crash-free sessions are instrumented.

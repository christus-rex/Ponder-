# Engineering Standards

## Development model

Use trunk-based development with short-lived branches:

- `feat/<name>`
- `fix/<name>`
- `chore/<name>`
- `security/<name>`

`main` must always be deployable. Prefer squash merges. One pull request should represent one coherent change.

## Definition of Done

A change is not complete until:

- acceptance criteria are met
- types compile
- lint and formatting checks pass
- unit tests pass
- relevant integration/E2E tests pass
- security-sensitive abuse cases are tested
- logs/metrics exist where operationally useful
- rollback is possible
- migrations are backward-compatible or have an explicit rollout plan
- documentation is updated when behavior or architecture changes

## CI gates

Every pull request should run:

1. locked dependency install
2. lint
3. formatting check
4. TypeScript/type check
5. unit tests
6. affected integration tests
7. production build
8. dependency vulnerability scan
9. secret scan
10. migration validation

Critical browser E2E paths:

- signup/login
- age gate/verification handoff
- report/block
- live-room join/leave
- purchase
- wallet/tip
- creator earnings/payout state

## Domain-first code organization

Primary domains:

- identity
- age-assurance
- profiles
- creator-onboarding
- discovery
- messaging
- rooms
- live-media
- moderation
- wallet
- billing
- payouts
- notifications
- admin
- audit

Business rules belong in domain/service modules, not React components or route handlers.

## API rules

- Validate every request at the boundary.
- Treat all client input as untrusted.
- Version externally consumed APIs.
- Use idempotency keys for payments, wallet mutations, payouts, and important webhooks.
- Make webhook handlers replay-safe.
- Use cursor pagination for unbounded lists.
- Return stable machine-readable error codes.
- Never expose internal stack traces to clients.

## Database rules

PostgreSQL is the system of record.

- Commit migrations to Git.
- Never manually edit production schema.
- Prefer UUID/ULID-style public identifiers.
- Store money in integer minor units.
- Use an append-only double-entry ledger for credits/tokens, purchases, refunds, creator earnings, platform fees, reserves, and payouts.
- Never reconstruct financial history from mutable rows.
- Record timestamps in UTC.
- Model lifecycle explicitly instead of relying on ambiguous booleans.

## Security baseline

- MFA for staff/admin accounts.
- Least-privilege infrastructure and DB access.
- Separate local/staging/production credentials.
- Encryption in transit and at rest.
- Short-lived signed URLs for private media.
- Rate-limit auth, messaging, uploads, payments, and reports.
- RBAC/ABAC for admin actions.
- Immutable audit events for moderation, money movement, account restrictions, and staff access.
- No secrets in source control.

## Testing strategy

Use a testing pyramid:

- many unit tests for domain rules
- focused integration tests around DB, queues, billing, and provider adapters
- smaller E2E suite for critical journeys
- load tests for room joins, chat fan-out, presence, webhook spikes, and media-session creation

Every bug affecting money, privacy, consent, age assurance, or moderation gets a regression test.

## Observability

Production should expose:

- structured logs with correlation IDs
- error tracking
- request latency/error-rate metrics
- queue/retry metrics
- payment webhook failures
- ledger reconciliation mismatches
- moderation backlog
- live-media session failures
- authentication anomalies

Never log passwords, raw card data, government IDs, verification images, or sensitive private-message bodies.

## ADR requirement

Record material architecture decisions under `docs/adr/`.

An ADR is required before:

- introducing a second backend language
- creating a separately deployed service
- changing the primary database
- changing the ledger model
- changing identity/age-verification strategy
- changing media topology
- changing payment processor

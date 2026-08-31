# Ponder+ Architecture

## Principle

Ponder+ is a modular TypeScript product with explicit authority boundaries. PostgreSQL owns durable state, Room Brain owns ephemeral live-room authority, and RealtimeKit is transport infrastructure rather than a source of product permission.

Do not introduce a second room, economy, identity, or moderation model beside these boundaries.

## Product surfaces

### Primary web product

The authenticated Next.js application owns:

- auth and onboarding
- discovery and resonance
- people/profile continuation
- room creation and entry
- live-room controls
- room-native translation controls
- host moderation UX
- server API routes

### Mobile companion

Expo/React Native shares domain rules where useful but is not a second backend or authority plane.

### Experiments

`demo/`, `preview/`, standalone translation samples, and Base Sepolia spikes are non-canonical experiments. They must not be used as evidence of production authorization, settlement, moderation, or deployment behavior.

## Durable data plane — Supabase/PostgreSQL

PostgreSQL is authoritative for:

- profiles and private adult/account data
- central access state and preferences
- rooms and server-owned room membership
- connection state
- discovery impressions/outcomes
- privacy-bounded presence
- room → provider meeting mappings
- tracked provider participant sessions and revocation reconciliation
- moderation audit records

Dormant `messages`, `wallet_links`, and ledger tables are retained as server-owned foundations but currently expose no browser access.

## Realtime authority plane — Room Brain

Room Brain is a Cloudflare Durable Object state machine. It owns ephemeral live-room truth:

- authoritative participant presence
- roles: host / moderator / speaker / viewer
- speaker queue
- room lock
- reaction buckets
- monotonic authority sequence
- retry/idempotency state
- demotion and participant ejection
- multi-connection presence
- reconnect snapshots and resync

Every browser command is sequence guarded. Backend-only moderation commands cannot enter through the normal client websocket codec.

Room Brain does **not** own durable account state, database membership enforcement, provider credentials, settlement, or KYC.

## Media plane — RealtimeKit

The browser talks to a provider-neutral `RealtimeMediaProvider` boundary.

Authorization chain:

```text
authenticated user
  -> live database room/membership check
  -> Room Brain sequence/role revalidation
  -> short-lived signed media capability
  -> trusted server provider exchange
  -> backend-owned room → RealtimeKit meeting mapping
  -> RealtimeKit participant token
  -> browser SDK join
```

Security invariants:

- viewers are subscribe-only
- host/moderator/speaker publication follows current Room Brain authority
- browser cannot submit role, preset, provider host, provider secret, or meeting ID
- synchronization loss suspends publication
- demotion/ejection revokes tracked provider participants
- unresolved provider cleanup is durably scheduled for reconciliation

## AI sidecars

Translation and future AI helpers are non-authoritative. They may generate captions/audio or moderation signals, but they cannot grant room roles, mint provider privilege, change account enforcement, or move money.

The authenticated `/rooms/lab` experience is the canonical translation integration. Standalone translation demos are examples only.

## Economy boundary

There is no canonical `PONDER_DEMO` economy.

The retained PostgreSQL accounting foundation is server-only and uses append-only/double-entry concepts with durable idempotency. Base Sepolia / USDC code is an experiment until a reviewed settlement API, compliance model, and entitlement flow exist.

## Deployment ownership

Ponder+ has separate runtime responsibilities:

1. **Web/API Worker** — Next.js via OpenNext/Cloudflare Workers.
2. **Room Brain Worker** — Cloudflare Durable Objects under `services/room-brain-worker`.
3. **Supabase** — Auth + PostgreSQL schema/migrations.
4. **Scheduled reconciliation** — invokes the private web API for bounded provider-session cleanup.
5. **GitHub Pages preview** — static non-production product preview only.

Production changes should be deployable and reversible per boundary. A successful web deployment does not imply Room Brain or Supabase schema deployment succeeded.

## Service-extraction rule

Stay modular-monolith-first. Extract another service only for measured scaling, fault isolation, security/compliance isolation, different runtime requirements, or explicit team ownership.

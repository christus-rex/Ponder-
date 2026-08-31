# Ponder+ Product Architecture v1

## Product thesis

Ponder+ is **live social with intent**. The product optimizes for mutually positive conversation and voluntary continuity, not watch time, follower count, gifting, or spend.

## Core loop

1. Declare intent.
2. Discover people and rooms by resonance.
3. Enter a small live room.
4. Request/grant a speaking seat when appropriate.
5. Use audio/video under authoritative Room Brain permissions.
6. Continue a relationship through explicit connection state.
7. Leave, block/report, or be removed without losing enforcement integrity.

## Current canonical intents

- talk
- meet
- deep_conversation
- create
- debate
- listen
- hang_out

## Resonance v1

Current deterministic benchmark:

- declared-intent affinity
- shared-interest overlap
- bounded opt-in availability bonus
- eligibility/block filtering

Spend, gift totals, follower count, and creator revenue are not ranking inputs.

## Live-room authority

### Durable layer

PostgreSQL owns room metadata and server-owned membership. Ejection is persisted here first so reconnecting cannot bypass removal.

### Ephemeral layer

Room Brain owns:

- presence
- current role
- speaker queue
- lock state
- reactions
- sequence/idempotency
- demotion/ejection transition
- reconnect/resync

### Media layer

RealtimeKit transports media behind a provider-neutral adapter. Provider permissions are downstream of current Room Brain authority.

The browser cannot choose media role, provider preset, meeting ID, provider host, or server API credentials.

## Moderation ladder

1. participant mute/leave controls
2. host speaker demotion
3. host durable participant ejection
4. tracked SFU participant revocation
5. durable cleanup reconciliation if provider deletion is transiently unavailable
6. central account enforcement for global restrictions

Reports/blocking beyond the current room-local controls should be implemented as durable server-owned state, never as client-only flags.

## Translation

Room-native translation is an optional sidecar:

- original media remains primary
- translated audio/captions are opt-in
- translation failure does not break room authority
- AI does not grant roles or alter moderation evidence

## Economy

There is no active production gifting economy.

The retained ledger schema is server-only. Base Sepolia / USDC work is an experiment until payment verification, entitlement, compliance, receipts, and settlement reconciliation are designed and reviewed.

## Build state

### Discovery
- [x] current intent and interests
- [x] deterministic resonance ranking
- [x] privacy-safe impressions/outcomes
- [x] bounded opt-in availability

### Relationship continuity
- [x] connection foundation and request/accept flow
- [ ] incoming connection inbox
- [ ] separate durable block model
- [ ] notifications
- [ ] reviewed direct messaging API

### Live rooms
- [x] server-owned room creation
- [x] authenticated room entry
- [x] Room Brain Durable Object authority
- [x] reconnect snapshots and sequence resync
- [x] speaker queue and seat grant
- [x] RealtimeKit browser adapter
- [x] trusted server media capability/provider exchange
- [x] microphone/camera publication policy
- [x] host speaker demotion
- [x] durable host participant ejection
- [x] provider revocation and reconciliation
- [x] room-native translation sidecar
- [ ] production operational rollout/credential validation

### Economy
- [x] server-only double-entry schema foundation
- [ ] canonical settlement API
- [ ] payment verification
- [ ] entitlements/catalog
- [ ] receipts/refunds
- [ ] creator payable/payout lifecycle

## Next product targets

1. production deployment validation across web, Room Brain, RealtimeKit, and Supabase
2. incoming connection inbox and explicit block model
3. durable reporting/appeal workflow
4. measured live-room reliability/latency instrumentation
5. economy work only after the server settlement contract is explicit

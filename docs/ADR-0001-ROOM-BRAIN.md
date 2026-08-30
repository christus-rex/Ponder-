# ADR-0001: Stateful Edge Room Brain

Status: Accepted for alpha experimentation

## Decision

Each live Ponder+ room gets one Cloudflare Durable Object, addressed deterministically from the Ponder room ID. This object is the **Room Brain**.

The Room Brain coordinates state that must be fast and strongly ordered but does not belong in the durable product database:

- presence
- participant roles mirrored from server authorization
- speaker/seat request queue
- room lock state
- reaction aggregation
- poll state
- lightweight moderation throttles
- monotonic room event sequence
- broadcast of already-settled gift animations

Cloudflare Realtime SFU is the primary alpha media plane. Supabase/Postgres remains the durable system of record.

## Why

A live room is naturally an actor: one identity, one ordered stream of commands, many connected clients. A Durable Object gives us a single point of coordination with WebSockets and strongly consistent local state without introducing Redis or a bespoke state cluster.

Using the lower-level Cloudflare Realtime SFU also lets Ponder+ own its room semantics instead of inheriting a generic meeting model.

## Boundaries

The Room Brain MUST NOT:

- store date of birth or age-verification evidence
- store account enforcement secrets
- settle gifts or mutate wallet ledger
- verify app-store purchases
- create payouts
- mint moderator/admin privilege
- become the authoritative store for durable moderated chat

Those remain server/Postgres responsibilities.

## Media flow

```text
React Native client
  |-- WebSocket --> Room Brain Durable Object
  |                  presence / queue / reactions / room state
  |
  |-- WebRTC ------> Cloudflare Realtime SFU
                     audio / video / data tracks

Trusted backend
  |-- authorizes room membership + roles
  |-- creates/controls SFU sessions and tracks
  |-- persists durable state to Postgres
```

## Gift flow

```text
viewer -> trusted gift endpoint -> Postgres transaction/ledger
                              -> accepted GiftEvent
                              -> Room Brain broadcast animation
```

A dropped Room Brain message can lose an animation, but can never lose or duplicate financial settlement.

## Failure strategy

- Clients reconnect with user ID + short-lived server authorization.
- Presence is reconstructed from active connections.
- Durable room configuration can be reloaded from Postgres.
- Ephemeral reaction buckets may reset without correctness impact.
- Monotonic event sequence detects stale client state.
- Financial and moderation audit records never depend on the Room Brain.

## Provider portability

The existing `RealtimeMediaProvider` interface remains. Cloudflare SFU is the first custom implementation; RealtimeKit or LiveKit may be added as fallback adapters if operational data justifies it.

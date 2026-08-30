# Ponder+ Room Brain Protocol v1

The Room Brain protocol is the application-level control channel for a live Ponder+ room. It is intentionally independent from the WebRTC media provider.

## Goals

- Survive mobile retries and reconnects without replaying actions.
- Detect clients issuing commands against stale room state.
- Keep a monotonic room sequence for snapshot reconciliation.
- Bound in-memory idempotency tracking.
- Keep financial settlement and durable moderation outside the realtime actor.

## Client envelope

```json
{
  "version": 1,
  "commandId": "cmd_react_001",
  "expectedSequence": 42,
  "command": {
    "type": "react",
    "userId": "user-123",
    "reaction": "🔥"
  }
}
```

### commandId

A client-generated idempotency key. Retrying the same command ID is a no-op.

The Room Brain retains only a bounded window of recent IDs. Financial operations must **not** rely on this bounded memory; gifts and purchases use durable Postgres idempotency keys.

### expectedSequence

Optional optimistic concurrency guard. When supplied, it must equal the Room Brain's current sequence. A mismatch causes rejection and the client should request/consume a fresh snapshot.

## Snapshot

Snapshots carry the current sequence plus ephemeral room state:

- room lock
- participants/roles
- speaker queue
- aggregated reactions

Clients can replace local ephemeral state from a snapshot after reconnect.

## Security boundary

A syntactically valid command is not automatically authorized. The Durable Object transport layer must bind each WebSocket to a server-verified user/role and must reject commands whose embedded actor/user IDs do not match that authenticated connection.

This protocol layer prevents replay/stale-state errors; transport authorization prevents identity/role spoofing.

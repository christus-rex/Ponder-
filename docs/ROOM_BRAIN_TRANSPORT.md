# Room Brain transport core

This layer is the adapter between an untrusted realtime connection and the pure Room Brain state machine.

It performs, in order:

1. Decode and validate bounded JSON input.
2. Bind the command to the authenticated connection identity.
3. Apply idempotency/stale-sequence checks.
4. Apply room-state invariants.
5. Return a safe sender reply.
6. Return a broadcast event only when state actually changed.

## Reply types

- `ack`: command accepted and sequence advanced.
- `duplicate`: retry recognized; no state mutation and no rebroadcast.
- `resync_required`: optimistic sequence was stale; includes a fresh snapshot.
- `error/invalid_message`: malformed/unrecognized wire input.
- `error/forbidden`: authenticated connection is not allowed to issue the command.
- `error/rejected`: command is valid/authenticated but impossible in current room state.

Error replies intentionally avoid leaking internal authorization or state details.

## Durable Object integration

The Cloudflare Durable Object handler should remain thin:

```text
webSocketMessage
  -> deserialize verified connection attachment
  -> handleRoomBrainClientMessage(...)
  -> ws.send(reply)
  -> if broadcast: send to other room sockets
  -> persist only the minimum state needed across hibernation/restart
```

Connection attachments should contain a server-verified user ID, room ID, role, connection ID, and protocol version. Client JSON must never overwrite attachment identity.

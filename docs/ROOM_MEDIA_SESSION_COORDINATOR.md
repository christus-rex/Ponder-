# Room media session coordinator v1

The room media session coordinator is the provider-neutral application boundary
between authoritative Room Brain state and an SFU adapter.

## Authority rules

- Only a synchronized Room Brain participant may join the SFU.
- Viewers join subscribe-only. Host, moderator, and speaker roles are eligible to
  publish audio.
- Local microphone intent can narrow publication but cannot grant it.
- Awaiting snapshots, sequence gaps, resync, missing presence, and shutdown all
  require publication to stop and the SFU session to leave.
- A role transition closes the old provider session before joining with the new
  authoritative role. Every join starts with the microphone disabled.

`RoomMediaSessionCoordinator` consumes `RoomBrainClientSyncState` from
`ManagedRoomBrainClient.onSyncStateChange`. It calls only
`RealtimeMediaProvider`; provider SDK objects and callbacks stay inside adapters.

```text
ManagedRoomBrainClient
  -> authoritative sync state
  -> RoomMediaSessionCoordinator
  -> RealtimeMediaProvider
  -> provider adapter / SFU SDK
```

Provider operations are serialized and reconciled against the newest desired
state after every asynchronous completion. A late join or microphone completion
therefore cannot restore an obsolete role or publish through a desynchronized
session.

SFU tokens remain short-lived and server-issued. Adapters must enforce their
server-side token grants independently; the coordinator does not mint or expand
provider permissions.

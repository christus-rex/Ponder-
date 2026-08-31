# Room media session coordinator v1

The room media session coordinator is the provider-neutral application boundary
between authoritative Room Brain state and an SFU adapter.

## Authority rules

- Only a synchronized Room Brain participant may join the SFU.
- Viewers join subscribe-only. Host, moderator, and speaker roles are eligible to
  publish audio and camera video.
- Local microphone and camera intent can narrow publication but cannot grant it.
- Awaiting snapshots, sequence gaps, resync, missing presence, and shutdown all
  require publication to stop and the SFU session to leave.
- A role transition closes the old provider session before joining with the new
  authoritative role. Every join starts with microphone and camera disabled.
- Every join requests a new short-lived authorization bound to the current room,
  user, role, and Room Brain sequence. Stale, expired, or mismatched
  authorizations are rejected before the provider sees them.

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
state after every asynchronous completion. A late authorization, join,
microphone, or camera completion therefore cannot restore an obsolete role or
publish through a desynchronized session.

The injected `requestJoinAuthorization` function is the server-backed boundary
that obtains SFU grants. Adapters must independently enforce their server-side
token grants; the coordinator validates the returned binding but does not mint
or expand provider permissions. Provider-specific camera track handling remains
inside the `RealtimeMediaProvider` adapter.

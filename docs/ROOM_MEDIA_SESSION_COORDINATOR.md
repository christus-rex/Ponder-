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
or expand provider permissions.

## RealtimeKit adapter

`RealtimeKitMediaProvider` is the production web SDK adapter. It initializes
RealtimeKit with audio and video disabled, verifies the token's provider preset
against the authoritative role before joining, controls local microphone and
camera publication, and exposes participant video-element registration without
leaking SDK objects into the domain package.

The required preset contract is deliberately strict:

- `viewer`: `canProduceAudio=NOT_ALLOWED`, `canProduceVideo=NOT_ALLOWED`
- `host`, `moderator`, `speaker`: both permissions must be `ALLOWED`
- `CAN_REQUEST` is rejected because Room Brain promotion, not a provider-side
  stage request, is the authority for publication

Preset names default to `ponder-host`, `ponder-moderator`, `ponder-speaker`, and
`ponder-viewer` for participant display mapping. Deployments with different
names must inject `roleForPresetName`; this mapping is informational and never
grants publication.

The adapter consumes only the short-lived participant token returned by
`requestJoinAuthorization`. RealtimeKit API credentials and participant creation
must stay on the server. Until that authoritative server endpoint and preset
configuration are deployed, the application must report media as unavailable;
it must not substitute a client-minted or broadly scoped token.

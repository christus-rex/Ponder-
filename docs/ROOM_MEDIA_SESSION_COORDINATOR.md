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

## Media capability issuance

The browser requests a media authorization from the same-origin Next.js backend
and sends only the Room Brain `authoritySequence`. It never supplies a trusted
role or user identifier.

The backend authenticates the current account, verifies active room access, then
uses a short-lived Room Brain credential to call the Room Brain Worker. The
Durable Object derives the participant role from its current authoritative room
state and requires the requested sequence to exactly match the current room
sequence. Only then does it issue a 30-second media capability token bound to:

- room ID
- user ID
- current Room Brain role
- exact authority sequence
- expiry

Media capabilities use `MEDIA_SESSION_AUTH_SECRET`, separate from
`ROOM_BRAIN_AUTH_SECRET`, so a leaked or incorrectly handled provider capability
cannot be replayed as a Room Brain connection ticket.

```text
browser
  -> POST /api/rooms/:roomId/media-authorization { authoritySequence }
  -> authenticated Next.js backend
  -> Room Brain Worker /rooms/:roomId/media-grant
  -> Durable Object checks live participant + exact sequence
  -> short-lived signed media capability
```

The injected `requestJoinAuthorization` function uses this server-backed
boundary. The capability is not permission for the client to mint or widen SFU
privileges. A provider adapter or trusted SFU exchange service must verify the
media capability and independently mint the provider-specific join credential.
Provider-specific camera track handling remains inside the
`RealtimeMediaProvider` adapter.

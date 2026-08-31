# Presence + Verified Resonance Outcomes

## Purpose

Presence answers one narrow question: **who is available for a conversation now?**

It is intentionally a weak ranking signal. Compatibility remains dominant.

## Presence privacy

- Online visibility is opt-in.
- The default is hidden.
- Clients never receive another user's `last_seen_at`.
- Discovery receives only `available_now: boolean`.
- A heartbeat becomes stale after two minutes.
- Heartbeats require an authenticated account with full Ponder+ access.
- The raw `user_presence` table has RLS enabled and no direct client grants.

## Resonance weighting

Resonance remains:

- intent affinity as the primary signal
- shared interests as the refinement signal
- availability as a maximum **+4 point** bonus

This means an online weak match should not outrank a materially stronger offline match.

New impression batches use algorithm version:

`resonance_v1_presence`

The original `resonance_v1` remains valid for historical telemetry.

## Verified outcome principle

An analytics event that claims a durable transition should be backed by durable state.

### Connection requested

The outcome is accepted only when a matching outbound connection exists in `pending` or `accepted` state.

### Connection accepted

The outcome is accepted only when an accepted connection exists between the two users.

### Room entered

The outcome is accepted only when both the viewer and recommended candidate are active members of the same room.

### Blocked

The outcome is accepted only when a blocked connection state exists.

### Reported

This currently fails closed. Ponder+ does not record a `reported` resonance outcome until durable moderation-report persistence is implemented.

### Profile opened

This remains a navigation-level event. It is useful product telemetry but should not be treated as a security-grade fact.

## Connection continuation

`request_connection_from_resonance` owns the durable transition:

- reject self-connections
- reject non-discoverable candidates
- reject blocked relationships
- preserve an existing outbound pending/accepted state
- treat an inbound pending request as mutual acceptance
- otherwise create an outbound pending request
- record resonance telemetry only after the durable connection state is valid

## Product surface

Discovery cards now lead to a person continuation page.

That page:

- records a profile-open event when reached from a valid resonance batch
- shows the person's intent, bio, and interests
- exposes a Connect action
- reflects pending/accepted state
- keeps the current user present while browsing

The live-room lab and discovery page also heartbeat presence.

## Next

1. Add an incoming connection inbox.
2. Separate block state from the connection relationship model.
3. Add durable moderation reports and wire verified report outcomes.
4. Wire room-entry outcomes into the production room join flow.
5. Add repeat-interaction evaluation after real room history is available.

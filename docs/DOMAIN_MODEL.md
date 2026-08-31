# Ponder+ Canonical Domain Model

This file describes the model the product actually uses. Experimental/demo schemas are intentionally excluded.

## Identity and access

### `profiles`
Public social identity:

- user id
- handle / display name / bio / avatar
- current social intent
- interests
- onboarding completion

### `user_private`
Private adult/account prerequisites such as date of birth, age status, and terms acceptance. Browser access is owner-scoped and sensitive enforcement fields are not client-mutable.

### central authorization / preferences
Server-owned account status/role and user preferences determine whether a user may enter the application and live rooms.

## Discovery and continuity

### `connections`
Durable requester/addressee relationship state.

### discovery telemetry
Impression batches, impressions, and verified outcomes store structured ranking evidence without storing conversation content.

### presence
Availability is opt-in and exposed through bounded server functions rather than unrestricted raw presence reads.

## Rooms

### `rooms`
Durable room metadata:

- creator/host
- title and description
- social intent
- capacity
- status: `open | closed | archived`

Creation/closure are server-owned lifecycle operations.

### `room_members`
Durable room-entry enforcement. Membership lifecycle is server-owned.

Current entry states:

- `active`
- `ejected`

An ejected row cannot be reactivated by browser policy, a new Room Brain ticket, or a new provider media exchange.

### Room Brain
Ephemeral authoritative live state, not a PostgreSQL participant table:

- sequence
- lock state
- participants and current roles
- speaker queue
- reaction buckets
- connection registry / presence
- backend-only moderation transitions

## Media provider state

### room media provider mapping
Backend-owned mapping from Ponder room id to provider meeting id. The browser never chooses this value.

### tracked provider sessions
Stores provider participant handles needed for deterministic demotion/ejection/leave/room-close cleanup and durable reconciliation.

## Moderation

Room-level moderation produces auditable server-owned records. Host ejection is durable in membership state before realtime cleanup is attempted.

Global account enforcement remains in central authorization rather than Room Brain.

## Translation

Translation state is a sidecar to a room. Original room media and authority remain canonical even if translation fails.

## Dormant server-only foundations

The following tables are intentionally retained but have no authenticated/anonymous browser access:

- `messages`
- `wallet_links`
- `ledger_accounts`
- `ledger_entries`
- `ledger_postings`

They are not active product capabilities until a dedicated reviewed API reintroduces narrowly scoped access.

## Economy

The only canonical direction is server-owned append-only/double-entry accounting. There is no `PONDER_DEMO` currency, gift catalog, gift event model, or client balance authority in the shared domain package.

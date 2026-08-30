# Ponder+ Domain Model v0

## Identity/safety
- `profiles`: public identity only.
- `age_attestations`: private DOB/18+ attestation.
- `account_controls`: server-owned enforcement and verification state.

## Community
- `creator_profiles`: creator metadata.
- `worlds`: persistent creator/community spaces.
- `world_members`: membership.
- `follows`: lightweight social graph.

## Live
- `live_rooms`: durable lifecycle and provider room reference.
- `room_participants`: server-authoritative role/seat state.
- `messages`: durable moderated chat; reactions remain ephemeral/aggregated.

## Economy
- `gift_catalog`: demo SKUs.
- `gift_events`: accepted gift action.
- `wallet_ledger`: immutable debit/credit legs.
- `correlation_id`: idempotency key across settlement legs.
- `PONDER_DEMO`: not purchasable or redeemable.

## Safety
- `reports`: user reports.
- `blocks`: hard user separation.

```text
auth.users
  |-- profiles -- creator_profiles
  |-- age_attestations
  |-- account_controls
  |-- follows
  |-- world_members -- worlds -- live_rooms -- messages
  |                                  |-- room_participants
  |                                  |-- gift_events -- gift_catalog
  |-- wallet_ledger <----------------+
  |-- reports
  |-- blocks
```

# Ponder+ Architecture v0

## Goal
Deliver a low-fixed-cost 18+ live-social MVP while preserving clean seams for media, payments, moderation, and scale.

## Boundaries
- **Mobile:** Expo + React Native owns presentation, device permissions, session UX, and calls trusted backend endpoints. It never receives service secrets.
- **Supabase/Postgres:** profiles, Worlds, room metadata, social graph, reports, blocks, demo economy, audit history. Sensitive writes are deny-by-default under RLS.
- **Realtime media:** Cloudflare RealtimeKit is the first target, hidden behind `RealtimeMediaProvider`.
- **Storage:** R2 holds media bytes; Postgres holds metadata/object keys.
- **Moderation:** automated checks + room controls + reports + human review.
- **Economy:** alpha uses non-purchasable `PONDER_DEMO` coins. Ledger entries are append-only and balances are derived.

## Client must never directly mutate
- wallet ledger or gift settlement
- purchase verification / creator payout state
- age-verification or account enforcement state
- moderator/admin privileges
- server-issued media roles/tokens

## Request shape
```text
Expo client -> authenticated API/Supabase -> Postgres + RLS
                                      -> privileged server functions
                                         -> RealtimeKit / R2 / moderation / payments
```

High-volume reactions and presence stay ephemeral/aggregated instead of becoming one Postgres row per event.

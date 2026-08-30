# Ponder+ v0.2 — Identity and Persistence

This milestone establishes the data boundary for authentic social continuity.

## Data model

- `profiles`: discoverable social identity and current intent
- `user_private`: date of birth and age-verification state, never publicly discoverable
- `rooms`, `room_members`, `messages`: small-room social graph
- `connections`: reconnect/friend relationship state
- `wallet_links`: user-owned wallet associations
- `ledger_accounts`, `ledger_entries`, `ledger_postings`: server-settled value ledger

## Security

All application tables have Row Level Security enabled.

The browser can never write ledger entries or postings. Those remain server/service operations. Users may only read ledger activity touching their own accounts.

The current age gate is self-attested and should not be represented as identity verification. The schema reserves a separate `verified` state for a future verification provider.

## Provisioning

Use a dedicated Ponder+ Supabase project. Do not apply this migration to unrelated projects.

1. Create the Ponder+ project.
2. Apply `supabase/migrations/20260830193000_identity_persistence.sql`.
3. Put the project's URL and publishable key in:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
4. Run the security and performance advisors after migration.
5. Test signup, email confirmation, onboarding, discovery, room membership, message RLS, and ledger read isolation.

## Definition of done

A new adult user can create an account, verify email, complete a profile, persist social intent/interests, discover other completed profiles and rooms, and retain identity across sessions.

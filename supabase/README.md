# Supabase backend

Ponder+ uses a dedicated Supabase project separate from unrelated applications.

- Project: `Ponder+`
- Project ref: `wjqcjlcmgeujndxvtprj`
- Region: `us-east-1`
- Cost at creation: `$0/month`

## Canonical migration order

1. `20260830193000_identity_persistence.sql`
2. `20260830202000_backend_hardening.sql`
3. `20260830202500_onboarding_preferences.sql`

The older experimental `0001_core.sql` schema was removed because it defined incompatible versions of `profiles`, `messages`, room enums, and ledger types. Do not restore or apply it.

## Security boundaries

- Public profiles and private DOB/age state are separate tables.
- Signup rejects users under 18 at both application and database boundaries.
- `age_status` and `age_verified_at` are server-owned; authenticated clients may only update `terms_accepted_at` in `user_private`.
- Terms acceptance is stamped by PostgreSQL and cannot be rewritten or cleared by the client.
- Mature-topic discovery preference lives in owner-only `user_preferences` with RLS.
- `profiles.onboarding_completed_at` cannot be set until Terms and a preferences row exist.
- The `SECURITY DEFINER` signup trigger is not callable through client RPC.
- Ledger tables are read-only to authenticated clients; settlement remains server-controlled.
- Row-level security is enabled on all user-facing tables.

After any DDL change, run Supabase security and performance advisors and address security findings before production rollout.

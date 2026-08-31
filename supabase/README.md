# Supabase backend

Ponder+ uses a dedicated Supabase project as the durable identity/data authority.

- Project: `Ponder+`
- Project ref: `wjqcjlcmgeujndxvtprj`
- Region: `us-east-1`

## Source of truth

All durable schema changes live in `supabase/migrations/` and are applied in timestamp order. Do not recreate an alternate schema in the Dashboard and do not restore the removed experimental core schema.

Current migration history covers:

- identity/adult persistence and backend hardening
- onboarding preferences and central authorization
- restricted-account least privilege
- resonance telemetry and privacy-bounded presence/outcomes
- backend-owned room → media-provider mappings
- server-owned room lifecycle
- moderation audit
- tracked provider participant sessions
- durable media-revocation reconciliation
- server-owned room membership/ejection
- frozen dormant messaging/wallet/ledger browser surfaces

## Production migration ownership

Use **Plan or Apply Ponder+ Supabase Migrations** in GitHub Actions.

The workflow requires:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_PASSWORD`

The production project ref is fixed in the workflow so an operator cannot redirect an approved run to a different project through arbitrary input.

Every run:

1. links the known production project,
2. compares local/remote migration history,
3. runs `supabase db push --linked --dry-run`.

Migrations are applied only when the workflow is explicitly dispatched with `apply=true`. The apply job repeats the dry run immediately before `supabase db push --linked` and is assigned to the `production-database` GitHub environment.

The workflow intentionally does **not** call `db reset`, `migration repair`, or `--include-all`. Migration-history drift must be investigated deliberately rather than automatically rewritten.

## Security boundaries

- public profile and private adult/account data remain separated
- sensitive account/verification state is server-owned
- terms/onboarding prerequisites are enforced at the database boundary
- room lifecycle and membership writes are server-owned
- ejected room members cannot reactivate themselves
- media-provider mappings/session handles are server-owned
- dormant messages, wallet links, and ledger tables expose no browser access
- accounting/settlement remains server-side
- row-level security remains enabled on user-facing durable state

After DDL changes, review Supabase security/performance advisors before production rollout.

# Ponder+ Engineering Rules

These rules apply to human and AI contributors.

## Product boundary
Ponder+ is an 18+ mature-audience live-social platform. The initial product is not an explicit-sexual-content marketplace.

## Non-negotiables
1. Never expose server secrets in Expo `EXPO_PUBLIC_*` variables.
2. Never let a client directly mutate wallet balance, creator earnings, purchase verification, payout status, age-verification state, or moderator/admin privileges.
3. Economy data is append-only; corrections use compensating entries.
4. Every gift or money-like operation must be idempotent.
5. Realtime media stays behind a provider interface.
6. Block, report, mute, moderation, and room termination are MVP requirements.
7. Public profiles stay separate from sensitive age/account-control data.
8. Add tests for economy, moderation, auth, and permission invariants.
9. Prefer least-privilege RLS; when uncertain, deny client writes and use a server function.
10. Do not weaken 18+ gates or safety controls to improve conversion.

Run `npm run qa` before requesting review.

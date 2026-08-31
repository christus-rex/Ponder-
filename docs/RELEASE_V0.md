# Ponder+ Consolidated v0 Baseline

This baseline represents the first coherent end-to-end Ponder+ architecture rather than a collection of parallel prototypes.

## Included

- authenticated Next.js web product
- Expo mobile companion build
- privacy-conscious 18+ onboarding and central authorization
- resonance-based discovery with bounded presence/outcome telemetry
- backend-provisioned live rooms
- Room Brain Durable Object authority with sequence/idempotency/resync
- server-owned room membership and durable host ejection
- provider-neutral media coordinator
- RealtimeKit browser adapter and trusted server participant exchange
- tracked provider sessions, bounded revocation, and durable reconciliation
- room-native translation sidecar
- server-owned PostgreSQL accounting foundation
- strict TypeScript, security/unit tests, production web build, and Android export

## Explicitly not production capabilities

- standalone browser demos and static GitHub Pages preview
- dormant browser messaging
- wallet linking
- gifting/subscriptions/payouts
- Base Sepolia testnet settlement spike
- any client-authoritative balance, room role, provider role, or moderation decision

## Production readiness gates

A release is not production-ready merely because CI is green. Production additionally requires:

- deployed Supabase migrations
- configured central auth/Supabase secrets
- deployed Room Brain Worker and Durable Object migration
- configured allowlisted Room Brain websocket URL
- configured RealtimeKit account/app/token/presets and backend meeting mappings
- deployed Next.js Cloudflare Worker with all server secrets
- media-reconciliation secret and production URL
- end-to-end authenticated smoke tests for auth, onboarding, room join, promotion/demotion/ejection, media, leave, and reconnect
- operational logging/alerts that do not expose capabilities or provider credentials

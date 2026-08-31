# Ponder+

**Less broadcasting. More belonging.**

Ponder+ is an 18+ live-social product focused on small, intentional conversations and relationship continuity rather than popularity or spend.

## Canonical product

The authenticated Next.js application is the primary product surface.

- **Web:** Next.js + React + TypeScript
- **Mobile companion:** Expo + React Native + TypeScript
- **Identity and durable data:** Supabase Auth + PostgreSQL
- **Discovery:** deterministic resonance ranking with privacy-bounded presence/outcome telemetry
- **Realtime authority:** Ponder Room Brain on Cloudflare Durable Objects
- **Media transport:** Cloudflare RealtimeKit behind a provider-neutral adapter
- **Translation:** authenticated room-native translation sidecar
- **QA:** strict TypeScript, unit/security tests, production web build, Android export

The live-room path is real and connected:

```text
Discover
  -> create / enter room
  -> authenticated Room Brain ticket
  -> authoritative snapshot + sequence
  -> server-verified media capability
  -> trusted RealtimeKit participant exchange
  -> provider-neutral room media coordinator
```

Room Brain is the authority for live roles, speaker queue, reactions, locks, demotion, ejection, reconnect/resync, and publication eligibility. The browser cannot choose provider roles, presets, meeting IDs, or credentials.

## Security boundaries

- Adult eligibility and account enforcement are server-side.
- Room membership lifecycle is server-owned; ejected users cannot mint fresh room/media access.
- Realtime publication fails closed when Room Brain is unsynchronized.
- RealtimeKit credentials are created only by trusted server exchange and sent only to allowlisted provider hosts.
- Provider revocation handles are persisted and unresolved cleanup is reconciled durably.
- Dormant messaging, wallet-link, and ledger tables have no browser access.
- Money-like accounting remains server-owned; there is no production gift economy in the canonical domain package.
- Private keys, service-role keys, provider API tokens, Room Brain secrets, and OpenAI server keys never belong in client bundles.

## Local development

```bash
cp .env.example .env.local
npm install
npm run dev
```

Mobile:

```bash
npm run mobile
```

Full verification:

```bash
npm run qa
npm run build
```

`npm run build` verifies the Next.js production build and Expo Android export.

## Experiments

Standalone demos, the GitHub Pages static preview, and Base Sepolia wallet/payment spikes are **experiments**, not alternate production architectures. See `docs/EXPERIMENTS.md`.

## Engineering references

- `docs/ARCHITECTURE.md` — current system boundaries and deployment ownership
- `docs/DOMAIN_MODEL.md` — canonical durable/ephemeral model
- `docs/PRODUCT_ARCHITECTURE_V1.md` — product loop and current build state
- `docs/ROOM_BRAIN_PROTOCOL.md` — Room Brain wire semantics
- `docs/ROOM_MEDIA_SESSION_COORDINATOR.md` — Room Brain → media authority
- `docs/TRUST_SAFETY_AND_COMPLIANCE.md` — safety/compliance direction
- `SECURITY.md` and `AGENTS.md` — repository guardrails

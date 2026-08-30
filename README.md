# Ponder+

**Less broadcasting. More belonging.**

Ponder+ is an authenticity-first 18+ live-social product focused on meaningful conversation, creator-led communities, small rooms, realtime communication, and relationships people choose to continue.

## Integrated stack

- **Web:** Next.js + React + TypeScript
- **Mobile:** Expo + React Native + TypeScript
- **Backend:** Supabase + Postgres
- **Realtime control:** Ponder Room Brain state machine + Cloudflare Durable Objects direction
- **Media:** Cloudflare Realtime SFU direction behind a provider abstraction
- **Storage:** Cloudflare R2 direction
- **Moderation:** layered automated checks + human review
- **Economy:** append-only/double-entry ledger; real-money settlement remains server-side
- **Crypto spike:** Base Account + USDC on Base Sepolia only
- **AI:** realtime translation prototype
- **QA:** GitHub Actions, strict TypeScript, unit/security tests, web + mobile builds

## Current working tracks

### Web product
The Next.js app contains the social shell, discovery, auth/onboarding work, health/config routes, Supabase helpers, wallet UI, Base Sepolia test configuration, and ledger tests.

### Mobile product
The Expo app contains the first privacy-conscious 18+ gate and the initial Ponder+ product shell.

### Room Brain
The shared domain package implements retry-safe live-room coordination: deterministic room state, speaker queues, reaction aggregation, command idempotency, stale-sequence resync, runtime message validation, authenticated actor binding, and transport-safe acknowledgements/errors.

### Working browser demo
Open `demo/index.html` for a self-contained interactive alpha covering age gate, discovery, room entry, seat requests, reactions, demo gifting, chat, reporting, and visible Room Brain event sequencing.

### Live AI Translator
The standalone translator demo is preserved, and the web app now also includes an authenticated `/rooms/lab` room-native translation sidecar that accepts a participant audio track, obtains ephemeral translation credentials from the backend, and keeps translated audio/captions separate from original room audio.

Run:

```bash
export OPENAI_API_KEY="..."
npm run translator:demo
```

See `docs/live-ai-translator.md` and `docs/room-native-translation.md`.

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

Full verification/build:

```bash
npm run qa
npm run build
```

`npm run build` produces a Next.js production build and an Expo Android export.

## Security boundaries

- DOB and age-verification data never belong in public profiles.
- Clients cannot directly mutate account enforcement, moderator authority, wallet settlement, purchase verification, or payouts.
- Room Brain connection identity must be server-verified; client JSON cannot mint roles.
- Financial operations use durable server-side idempotency and accounting.
- Private keys, seed phrases, OpenAI server keys, service-role keys, and payment secrets never enter client bundles.
- Testnet precedes any mainnet crypto workflow.
- Mature/adult positioning does not bypass app-store, payment, identity, sanctions, or legal requirements.

See `AGENTS.md`, `SECURITY.md`, and `docs/` for architecture and QA decisions.

# Ponder+

**Less broadcasting. More belonging.**

Ponder+ is an authenticity-first 18+ live-social product focused on meaningful conversation, creator-led communities, small rooms, realtime communication, and relationships people choose to continue.

This repository is the canonical engineering source for the project.

## Engineering direction

- Web application: Next.js + React + TypeScript
- Mobile direction: Expo + React Native + TypeScript
- Backend direction: Supabase + Postgres
- Realtime media: provider abstraction, Cloudflare RealtimeKit first
- Media storage: Cloudflare R2
- Moderation: layered automated + human review
- Economy: append-only/double-entry ledger; real-money settlement remains server-side
- Crypto spike: Base Account + USDC, Base Sepolia testnet first
- CI/QA: GitHub Actions + unit/integration tests

## Current working tracks

### 1. Authentic social shell + crypto foundation

The main Next.js application currently includes:

- social-intent and small-room product shell
- health/config API routes
- Base Account connection prototype
- Base Sepolia testnet configuration
- Circle test USDC address for Base Sepolia
- test-USDC transfer prototype
- balanced double-entry ledger domain with tests

No real-funds workflow is enabled in this milestone.

Run it locally:

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000`.

To enable the test-tip button, set:

```bash
NEXT_PUBLIC_PONDER_TIP_RECIPIENT=0x...
```

Use only a Base Sepolia address you control. Testnet USDC has no monetary value.

### 2. Live AI Translator

The realtime speech translator prototype uses OpenAI's dedicated realtime translation API.

Current demo capabilities:

- microphone-to-translated-audio streaming over WebRTC
- automatic source-language handling
- source and translated live captions
- selectable target language
- server-side API-key protection with ephemeral browser credentials
- zero third-party runtime dependencies for the local translator server
- Node unit tests

Run it locally:

```bash
export OPENAI_API_KEY="..."
npm run translator:demo
```

Then open `http://localhost:8787`.

The main application now also contains an authenticated `/rooms/lab` track-sidecar integration. It accepts a single `MediaStreamTrack`, mints an ephemeral translation credential on the authenticated backend, and keeps translated audio/captions separate from the room's original audio.

See `docs/live-ai-translator.md` and `docs/room-native-translation.md` for room-scale architecture, production hardening, QA, and cost-control strategy.

## Architecture boundary

```text
Social experience
  ├─ profiles / discovery / rooms / messaging
  ├─ realtime translation / media
  └─ application database

Value layer
  ├─ wallet connection
  ├─ Ponder internal ledger
  ├─ settlement adapter
  └─ Base / USDC
```

Social activity stays off-chain. Blockchain is reserved for settlement, ownership, and portable attestations where it adds real value.

## Next milestones

1. Persist users, profiles, rooms, conversations, wallets, and ledger entries.
2. Add authentication and profile onboarding.
3. Add 1:1 messaging and reconnect.
4. Connect the room-native translator sidecar to live RealtimeKit meeting tokens and participant tracks.
5. Add server-side transaction verification/indexing.
6. Replace direct test transfers with payment intents and ledger reconciliation.
7. Add moderation primitives before any mature-content surface.

## Security principles

- Never store private keys or seed phrases in the application database.
- Never expose the OpenAI server API key to browser clients.
- Never infer balances from UI events.
- Every monetary state transition must be idempotent and auditable.
- Testnet precedes mainnet.
- Mature/adult experiences must not be used to bypass payment, app-store, identity, sanctions, or legal requirements.
- Base Account is temporarily pinned to 2.5.5 and Axios is overridden to the patched 1.20.0 release because the current CDP dependency chain can otherwise resolve to a vulnerable Axios version; revisit both constraints when the upstream chain is patched.

Development begins on feature branches and is merged through pull requests.

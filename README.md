# Ponder+

**Less broadcasting. More belonging.**

Ponder+ is an authenticity-first social product designed around meaningful conversations, small-group interaction, intentional discovery, and relationships people choose to continue.

## Current milestone — v0.1 crypto foundation

This branch establishes the first deployable application shell and a deliberately isolated value layer:

- Next.js + React + TypeScript application
- social-intent and small-room product shell
- health/config API routes
- Base Account connection prototype
- Base Sepolia testnet only
- Circle test USDC address for Base Sepolia
- test-USDC transfer prototype
- balanced double-entry ledger domain
- CI for typecheck, tests, and production build

No real-funds workflow is enabled in this milestone.

## Quick start

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

## Engineering boundaries

```text
Social experience
  ├─ profiles / discovery / rooms / messaging
  └─ application database

Value layer
  ├─ wallet connection
  ├─ Ponder internal ledger
  ├─ settlement adapter
  └─ Base / USDC
```

Social activity stays off-chain. Blockchain is reserved for settlement, ownership, and portable attestations where it adds real value.

## Next milestones

1. Persist users, rooms, conversations, wallets, and ledger entries.
2. Add authentication and profile onboarding.
3. Add 1:1 messaging and reconnect.
4. Add server-side transaction verification/indexing.
5. Replace direct test transfers with payment intents and ledger reconciliation.
6. Add moderation primitives before any mature-content surface.

## Security principles

- Never store private keys or seed phrases in the application database.
- Never infer balances from UI events.
- Every monetary state transition must be idempotent and auditable.
- Testnet precedes mainnet.
- Mature/adult experiences must not be used to bypass payment, app-store, identity, sanctions, or legal requirements.

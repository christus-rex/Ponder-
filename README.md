# Ponder+

Ponder+ is an 18+ live-social product focused on mature conversation, creator-led communities, live rooms, and meaningful connection.

This repository is the canonical engineering source for the project.

## Initial engineering direction

- Mobile: Expo + React Native + TypeScript
- Backend: Supabase + Postgres
- Realtime media: provider abstraction, Cloudflare RealtimeKit first
- Media storage: Cloudflare R2
- Moderation: layered automated + human review
- Economy: append-only ledger; real-money settlement remains server-side
- CI/QA: GitHub Actions + unit/integration tests

## Live AI Translator

The first working Ponder+ feature prototype is a realtime speech translator using OpenAI's dedicated realtime translation API.

Current demo capabilities:

- microphone-to-translated-audio streaming over WebRTC
- automatic source-language handling
- source and translated live captions
- selectable target language
- server-side API-key protection with ephemeral browser credentials
- zero third-party runtime dependencies for the local demo
- Node unit tests and GitHub Actions CI

Run it locally:

```bash
export OPENAI_API_KEY="..."
npm run translator:demo
```

Then open `http://localhost:8787`.

See `docs/live-ai-translator.md` for room-scale architecture, production hardening, QA, and cost-control strategy.

Development begins on feature branches and is merged through pull requests.

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

Development begins on feature branches and is merged through pull requests.

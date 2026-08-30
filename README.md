# Ponder+

Ponder+ is an 18+ live-social product focused on mature conversation, creator-led communities, live rooms, and meaningful connection.

This repository is the canonical engineering source for the project.

## Initial engineering direction

- Primary product: responsive web app / PWA
- Mobile companion: Expo + React Native + TypeScript, later phase
- Backend: TypeScript modular monolith + Postgres
- Initial data platform: Supabase/Postgres, subject to provider approval for the business model
- Realtime media: provider abstraction; vendor chosen only after explicit business-model approval
- Media storage: provider abstraction with signed access and lifecycle controls
- Moderation: layered product controls + automated signals + human review
- Economy: append-only double-entry ledger; real-money settlement remains server-side
- CI/QA: GitHub Actions + typecheck/lint/unit/integration/E2E gates

## Non-negotiable principles

- Adults only; no minors.
- No anonymous random-chat architecture as the core product.
- Trust, consent, moderation, and auditability ship in the MVP.
- Provider-specific logic stays behind adapters.
- No secrets or production credentials in Git.
- `main` remains deployable; development uses short-lived branches and pull requests.
- Start as a modular monolith; split services only after measured scaling or isolation pressure.

## Engineering docs

- [Engineering Standards](docs/ENGINEERING_STANDARDS.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Trust, Safety & Compliance Baseline](docs/TRUST_SAFETY_AND_COMPLIANCE.md)
- [Delivery Strategy](docs/DELIVERY_STRATEGY.md)

## Current phase

Foundation / pre-MVP.

The first milestone proves one complete loop:

`discover -> verify -> interact -> purchase -> compensate creator -> moderate -> reconcile`

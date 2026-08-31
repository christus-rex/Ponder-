# Experiments and Non-Canonical Surfaces

Ponder+ keeps a small number of experiments for design, integration, and deployment learning. They are intentionally **not** alternate production architectures.

## `demo/`

Standalone browser/social demo.

Purpose:
- rapid interaction prototyping
- visual/product-flow exploration
- translator sample hosting

Not authoritative for:
- authentication or adult eligibility
- Room Brain roles
- durable room membership
- moderation/ejection
- provider media credentials
- financial state

Any demo-only chat, gift, or local room behavior must stay isolated from canonical domain exports.

## `preview/` and GitHub Pages

Static public preview for product/design review only.

It is not the authenticated application and must never be treated as a production fallback for auth, rooms, media, moderation, or settlement.

## Standalone translator demo

`npm run translator:demo` remains an integration sample. The authenticated `/rooms/lab` sidecar is the canonical product integration.

## Base Sepolia / USDC spike

Testnet wallet/payment code is an experiment for settlement research.

It does not create a production balance, entitlement, gift, subscription, creator payable, or payout system. The canonical durable accounting direction is the server-owned PostgreSQL double-entry foundation.

## Promotion rule

An experiment becomes canonical only when it has:

1. an explicit server authority boundary,
2. product integration in the authenticated application,
3. security and failure-mode tests,
4. documented durable data ownership,
5. CI/build coverage,
6. deployment ownership,
7. removal or migration of competing prototype models.

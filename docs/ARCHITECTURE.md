# Architecture

## Core strategy

Start with a modular monolith and explicit provider adapters. Do not begin with microservices.

This minimizes fixed cost and operational complexity while preserving boundaries that can be extracted later.

## Distribution

Primary product: responsive web app / PWA.

Expo/React Native remains a later companion-client option. Early revenue must not depend on app-store approval.

## Logical architecture

### Client plane

Account/profile, discovery, messaging, live-room experience, wallet/purchases, creator dashboard, report/block UX.

### Application/control plane

One backend organized by domain modules for authentication, age/identity orchestration, authorization, rooms, presence, chat, billing, wallet ledger, creator earnings/payout accounting, moderation, notifications, and audit.

### Data plane

PostgreSQL is authoritative. Use object storage for media/assets. Add Redis-compatible cache only after measured need. Use a transactional outbox for async work instead of dual-writing the database and queues.

### Media plane

Keep live video/audio behind a `MediaProvider` interface.

Ponder+ owns room authorization, media-token issuance, room metadata, safety state, entitlements, and billing. The media provider owns WebRTC/SFU/HLS transport, TURN where needed, and media-network scaling.

Never couple entitlements or the financial ledger to one media vendor.

### Trust/compliance plane

Use adapters and auditable records for age assurance, creator KYC, consent/attestations, moderation signals, reports, sanctions, geo policy, and payment risk. Store normalized status/reference data rather than raw provider payloads whenever practical.

## Initial monorepo

```
apps/
  web/
  admin/
  api/

packages/
  ui/
  domain/
  db/
  auth/
  observability/
  config/
  provider-contracts/

docs/
  adr/
```

Prefer one TypeScript ecosystem for MVP unless a measured requirement justifies another language.

## Authentication/authorization

Server-side session authority. Verified-adult state is a server-side scoped entitlement, never a client-side flag. Staff/admin identities use stronger authentication. Sensitive authorization checks execute server-side.

## Realtime

Use WebSockets for presence, room state, chat, and moderation events. Do not use WebSockets as the authoritative record for money movement.

## Financial model

Treat credits/tokens as accounting entries. Every mutation produces balanced ledger entries. Processor webhooks reconcile external money to internal ledger state.

## Scalability triggers

Extract a service only for measured independent scaling, fault isolation, security/compliance boundaries, a materially different runtime, independent deployment cadence, or clear team ownership.

Likely later extraction candidates: live-media orchestration, realtime messaging/presence, media moderation/processing, and settlement/reconciliation.

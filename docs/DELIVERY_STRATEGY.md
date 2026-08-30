# Delivery Strategy

## Product thesis

Ponder+ should validate a differentiated adult live-social experience before attempting a full Tango-scale feature set.

The MVP proves one complete loop:

`discover -> verify -> interact -> purchase -> compensate creator -> moderate -> reconcile`

## Distribution

Primary: web/PWA.

Treat iOS/Android native apps as optional later companion/discovery products. Early revenue must not depend on mobile-store approval.

Avoid anonymous/random stranger chat as the central mechanic. Prefer persistent accounts, creator identities, follows, room context, and reputation.

## MVP must-have

Account creation/auth; 18+ age-assurance adapter; creator verification; profiles; follow/favorite; discovery; messaging/room chat; live room create/join; report/block; moderation console; wallet/token ledger; payment sandbox; tips/gifts; creator earnings; payout state machine; audit events; analytics/observability.

## Explicitly defer

Complex recommendation ML, multiple virtual currencies, crypto, native apps, plugin marketplace, elaborate gamification, dozens of gift animations, multi-region active-active, microservices, and custom codec/video infrastructure.

## Phases

### Phase 0 — Foundation

Product/community policy, threat model, architecture/ADRs, design system, CI/CD, environments, identity model, database schema, and provider interfaces.

Exit: deployable skeleton with tests and observability.

### Phase 1 — Closed functional MVP

User/creator onboarding, profiles/discovery, chat, live rooms, report/block, moderator console.

Exit: invited adults can complete a safe interaction loop.

### Phase 2 — Transaction MVP

Approved high-risk/adult processor sandbox, double-entry ledger, tips/gifts, creator earnings, refund/chargeback states, payout workflow.

Exit: every monetary event reconciles from processor event to internal ledger.

### Phase 3 — Controlled beta

Limited creators, moderation operations, fraud/risk rules, support tooling, retention measurement, load testing.

Exit criteria are metric-driven, not calendar-driven.

### Phase 4 — Scale proven bottlenecks

Scale media, realtime, moderation, search, and recommendation only from measured constraints.

## KPI hierarchy

Safety: verification completion/failure, reports per 1,000 interactions, moderation response time, repeat-offender rate, chargeback/fraud rate.

Product: activation, creator activation, first meaningful interaction, viewer-to-follower conversion, viewer-to-payer conversion, payer retention, creator retention.

System: room join success, message latency, media startup time, error rate, payment reconciliation mismatch count.

## Cost strategy

Keep a consolidated modular backend, managed Postgres initially, object-storage lifecycle rules, on-demand media from a provider that explicitly approves the business model, capped beta concurrency, event-driven workers where practical, and per-minute media/gross-margin measurement from the first paid beta.

## Vendor acceptance rule

No critical provider is selected only because its API or free tier is attractive.

Before integration, verify business-model approval for payments, payouts, age assurance, live media, storage/CDN, email/SMS, and moderation. Maintain an adapter and exit plan for every high-risk dependency.
